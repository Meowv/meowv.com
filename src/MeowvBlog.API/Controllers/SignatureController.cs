using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Dto.Signature;
using MeowvBlog.API.Models.Entity.Signature;
using MeowvBlog.API.Models.Enum;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Processing;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class SignatureController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly MeowvBlogDBContext _context;

        public SignatureController(IHttpClientFactory httpClient, MeowvBlogDBContext context)
        {
            _httpClient = httpClient;
            _context = context;
        }

        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [HttpPost]
        public async Task<Response<string>> GenerateSignatureAsync(string name, int id)
        {
            var response = new Response<string>();

            if (name.Length > 4)
            {
                response.Msg = "名字只支持1-4个字符";
                return response;
            }

            var type = typeof(SignatureEnum).EnumToList().FirstOrDefault(x => x.Value.Equals(id))?.Description;
            if (string.IsNullOrEmpty(type))
            {
                response.Msg = "不存在的签名类型";
                return response;
            }

            var signatureLog = await _context.SignatureLogs.FirstOrDefaultAsync(x => x.Name.Equals(name) && x.Type.Equals(type));
            if (null != signatureLog)
            {
                response.Result = signatureLog.Url;
                return response;
            }

            var ip = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (string.IsNullOrEmpty(ip)) ip = Request.HttpContext.Connection.RemoteIpAddress.ToString();

            var url = $"{(name + id).ToMd5()}.png";

            #region 生成签名

            var signatureUrl = AppSettings.Signature.Urls.OrderBy(x => Guid.NewGuid()).Select(x => new
            {
                Url = x.Key,
                Parameter = string.Format(x.Value, name, id)
            }).FirstOrDefault();

            var content = new StringContent(signatureUrl.Parameter);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("user-agent", "Mozilla/5.0");
            var httpResponse = await client.PostAsync(signatureUrl.Url, content);
            var result = await httpResponse.Content.ReadAsStringAsync();

            var regex = new Regex(@"<img\b[^<>]*?\bsrc[\s\t\r\n]*=[\s\t\r\n]*[""']?[\s\t\r\n]*(?<imgUrl>[^\s\t\r\n""'<>]*)[^<>]*?/?[\s\t\r\n]*>", RegexOptions.IgnoreCase);
            var imgUrl = regex.Match(result).Groups["imgUrl"].Value;

            // 生成签名路径
            var signaturePath = Path.Combine(AppSettings.Signature.Path, url);

            // 下载签名图片至本地
            await (await client.GetByteArrayAsync(imgUrl)).SaveImg(signaturePath);

            // 添加水印并且保存图片
            await AddWatermarkSaveItAsync(signaturePath);

            #endregion

            var entity = new SignatureLog
            {
                Name = name,
                Type = type,
                Url = url,
                Ip = ip,
                Date = DateTime.Now
            };
            await _context.SignatureLogs.AddAsync(entity);
            await _context.SaveChangesAsync();

            response.Result = url;
            return response;
        }

        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("type")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetSignatureTypeAsync()
        {
            var response = new Response<IList<EnumResponse>>();
            var result = typeof(SignatureEnum).EnumToList();
            response.Result = result;
            return await Task.FromResult(response);
        }

        /// <summary>
        /// 获取个性签名记录
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("logs")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<SignatureLogDto>>> GetSignatureLogAsync()
        {
            var response = new Response<IList<SignatureLogDto>>();

            var signatureLogs = await _context.SignatureLogs
                                              .OrderByDescending(x => x.Date).Take(20)
                                              .SelectToListAsync(x => new SignatureLogDto
                                              {
                                                  Name = x.Name.Substring(0, 1) + "**",
                                                  Type = x.Type,
                                                  Url = x.Url,
                                                  Ip = x.Ip,
                                                  Date = x.Date.ToDateTime(default)
                                              });
            response.Result = signatureLogs;
            return response;
        }

        /// <summary>
        /// 添加水印，并保存处理好的图片
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <returns></returns>
        private async Task AddWatermarkSaveItAsync(string signaturePath)
        {
            var watermarkPath = Path.Combine(Directory.GetCurrentDirectory(), "Resources/watermark.png");

            var watermarkBytes = await System.IO.File.ReadAllBytesAsync(watermarkPath);
            var signatureBytes = await System.IO.File.ReadAllBytesAsync(signaturePath);

            var watermarkImg = Image.Load(watermarkBytes);
            var signatureImg = Image.Load(signatureBytes, out IImageFormat format);

            watermarkImg.Mutate(context =>
            {
                context.DrawImage(signatureImg, 0.8f);
            });

            var signatureImgBase64 = watermarkImg.ToBase64String(format);

            var regex = new Regex("data:image/(.*);base64,");
            signatureImgBase64 = regex.Replace(signatureImgBase64, "");
            var bytes = Convert.FromBase64String(signatureImgBase64);

            await bytes.SaveImg(signaturePath);
        }
    }
}
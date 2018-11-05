using Meowv.Models.AppSetting;
using Meowv.Models.JsonResult;
using Meowv.Models.Signature;
using Meowv.Processor.Signature;
using Meowv.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Processing;
using SixLabors.Primitives;
using System;
using System.ComponentModel;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Meowv.Areas.Signature
{
    [ApiController, Route("[Controller]")]
    [Authorize]
    public class SignatureController : ControllerBase
    {
        private AppSettings _settings;
        private IHostingEnvironment _hostingEnvironment;

        public SignatureController(IHostingEnvironment hostingEnvironment, IOptions<AppSettings> option)
        {
            _settings = option.Value;
            _hostingEnvironment = hostingEnvironment;
        }

        /// <summary>
        /// 艺术签
        /// </summary>
        /// <param name="name">姓名</param>
        /// <returns></returns>
        [HttpGet, Route("art")]
        public async Task<JsonResult<SignatureEntity>> GetArtSignature(string name)
        {
            return await GetSignature(name, SignatureEnum._art);
        }

        /// <summary>
        /// 艺术签无二维码
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet, Route("v2/art")]
        public async Task<JsonResult<SignatureEntity>> GetArtSignatureNoQRCode(string name)
        {
            return await GetSingnatureNoQRCode(name, SignatureEnum._art);
        }

        /// <summary>
        /// 商务签
        /// </summary>
        /// <param name="name">姓名</param>
        /// <returns></returns>
        [HttpGet, Route("biz")]
        public async Task<JsonResult<SignatureEntity>> GetBizSignature(string name)
        {
            return await GetSignature(name, SignatureEnum._biz);
        }

        /// <summary>
        /// 商务签无二维码
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet, Route("v2/biz")]
        public async Task<JsonResult<SignatureEntity>> GetBizSignatureNoQRCode(string name)
        {
            return await GetSingnatureNoQRCode(name, SignatureEnum._biz);
        }

        /// <summary>
        /// 获取签名
        /// </summary>
        /// <param name="name">姓名</param>
        /// <param name="signature">签名类型</param>
        /// <returns></returns>
        [NonAction]
        public async Task<JsonResult<SignatureEntity>> GetSignature(string name, SignatureEnum signature)
        {
            try
            {
                var url = "http://www.jiqie.com";

                var fromUrlContent = new StringContent($"id={name}&idi=jiqie&id1=800&id2={(int)signature}&id3=#000000&id4=#000000&id5=#000000&id6=#000000");
                fromUrlContent.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

                using (var http = new HttpClient())
                {
                    var responseMsg = await http.PostAsync(new Uri(url + "/a/re22.php"), fromUrlContent);
                    var htmlContent = await responseMsg.Content.ReadAsStringAsync();

                    var signUrl = htmlContent.Replace("<img src=\"", "").Replace("\">", "");

                    var originalImgPath = $"{_hostingEnvironment.WebRootPath}/signature/{name}.jpg";

                    FileHelper.DownLoad(signUrl, originalImgPath);

                    var random_num = new Random();
                    var num = random_num.Next(1, 3);
                    var watermarkImgPath = $"{_hostingEnvironment.WebRootPath}/images/qrcode{num}.jpg";

                    var originalImgBytes = await System.IO.File.ReadAllBytesAsync(originalImgPath);
                    var watermarkImgBytes = await System.IO.File.ReadAllBytesAsync(watermarkImgPath);

                    var originalImg = Image.Load(originalImgBytes, out IImageFormat format);
                    var watermarkImg = Image.Load(watermarkImgBytes);

                    originalImg.Mutate(x =>
                    {
                        x.DrawImage(watermarkImg, 1, new Point(390, 90));
                    });

                    var imgBase64 = originalImg.ToBase64String(format);
                    var reg = new Regex("data:image/(.*);base64,");
                    imgBase64 = reg.Replace(imgBase64, "");
                    var bytes = Convert.FromBase64String(imgBase64);

                    var signaturePath = $"{_hostingEnvironment.WebRootPath}/signature/{name}{signature}.jpg";

                    FileHelper.SaveFile(bytes, signaturePath);

                    var entity = new SignatureEntity
                    {
                        Name = name,
                        Type = signature
                            .GetType()
                            .GetMember(signature.ToString())
                            .FirstOrDefault()
                            .GetCustomAttribute<DescriptionAttribute>()
                            .Description,
                        Url = $"{_settings.Domain}/signature/{name}{signature}.jpg"
                    };

                    System.IO.File.Delete(originalImgPath);

                    return new JsonResult<SignatureEntity> { Result = entity };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<SignatureEntity> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取签名不带二维码
        /// </summary>
        /// <param name="name"></param>
        /// <param name="signature"></param>
        /// <returns></returns>
        [NonAction]
        public async Task<JsonResult<SignatureEntity>> GetSingnatureNoQRCode(string name, SignatureEnum signature)
        {
            try
            {
                var url = "http://www.jiqie.com";

                var fromUrlContent = new StringContent($"id={name}&idi=jiqie&id1=800&id2={(int)signature}&id3=#000000&id4=#000000&id5=#000000&id6=#000000");
                fromUrlContent.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

                using (var http = new HttpClient())
                {
                    var responseMsg = await http.PostAsync(new Uri(url + "/a/re22.php"), fromUrlContent);
                    var htmlContent = await responseMsg.Content.ReadAsStringAsync();

                    var signUrl = htmlContent.Replace("<img src=\"", "").Replace("\">", "");

                    var originalImgPath = $"{_hostingEnvironment.WebRootPath}/signature/{name}{signature}_v.jpg";

                    FileHelper.DownLoad(signUrl, originalImgPath);

                    var entity = new SignatureEntity
                    {
                        Name = name,
                        Type = signature
                            .GetType()
                            .GetMember(signature.ToString())
                            .FirstOrDefault()
                            .GetCustomAttribute<DescriptionAttribute>()
                            .Description,
                        Url = $"{_settings.Domain}/signature/{name}{signature}_v.jpg"
                    };

                    return new JsonResult<SignatureEntity> { Result = entity };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<SignatureEntity> { Reason = e.Message };
            }
        }
    }
}
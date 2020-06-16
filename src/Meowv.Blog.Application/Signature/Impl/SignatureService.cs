using Meowv.Blog.Application.Caching.Signature;
using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.Domain.Shared.Enum;
using Meowv.Blog.Domain.Signature.Repositories;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Signature.Impl
{
    public class SignatureService : ServiceBase, ISignatureService
    {
        private readonly ISignatureCacheService _signatureCacheService;
        private readonly ISignatureRepository _signatureRepository;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IHttpClientFactory _httpClient;

        public SignatureService(ISignatureCacheService signatureCacheService,
                                ISignatureRepository signatureRepository,
                                IHttpContextAccessor httpContextAccessor,
                                IHttpClientFactory httpClient)
        {
            _signatureCacheService = signatureCacheService;
            _signatureRepository = signatureRepository;
            _httpContextAccessor = httpContextAccessor;
            _httpClient = httpClient;
        }

        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GenerateSignatureAsync(GenerateSignatureInput input)
        {
            var result = new ServiceResult<string>();

            var ip = _httpContextAccessor.HttpContext.Request.GetClientIp();
            // TODO:当前ip是否在小黑屋，禁止使用

            // 验签，请求是否合法
            var sign = $"{input.Name}_{input.Id}_{input.Timestamp}".EncodeMd5String().ToLower();
            if (input.Sign != sign)
            {
                result.IsFailed("验签不正确");
                return result;
            }

            return await _signatureCacheService.GenerateSignatureAsync(input, async () =>
            {
                // 签名类型
                var type = typeof(SignatureEnum).TryToList().FirstOrDefault(x => x.Value.Equals(input.Id))?.Description;
                if (string.IsNullOrEmpty(type))
                {
                    result.IsFailed("签名类型不存在");
                    return result;
                }

                // 查询是否存在此签名，存在则直接返回
                var signature = await _signatureRepository.FindAsync(x => x.Name.Equals(input.Name) && x.Type.Equals(type));
                if (signature.IsNotNull())
                {
                    result.IsSuccess(signature.Url);
                    return result;
                }

                // 签名图片名称
                var signaturePicName = $"{sign}.png";

                // 在配置文件中随机取一条签名api
                var signatureUrl = AppSettings.Signature.Urls.OrderBy(x => GuidGenerator.Create()).Select(x => new
                {
                    Url = x.Key,
                    Parameter = x.Value.FormatWith(input.Name, input.Id)
                }).FirstOrDefault();

                // 发送请求，获取结果
                var content = new StringContent(signatureUrl.Parameter);
                content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");
                using var client = _httpClient.CreateClient();
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.14 Safari/537.36 Edg/83.0.478.13");
                var httpResponse = await client.PostAsync(signatureUrl.Url, content);
                var httpResult = await httpResponse.Content.ReadAsStringAsync();

                // 正则获取api返回的签名图片
                var regex = new Regex(@"<img\b[^<>]*?\bsrc[\s\t\r\n]*=[\s\t\r\n]*[""']?[\s\t\r\n]*(?<imgUrl>[^\s\t\r\n""'<>]*)[^<>]*?/?[\s\t\r\n]*>", RegexOptions.IgnoreCase);
                var imgUrl = regex.Match(httpResult).Groups["imgUrl"].Value;

                // 签名保存的路径
                var signaturePath = Path.Combine(AppSettings.Signature.Path, signaturePicName);

                // 保存图片至本地
                var imgBuffer = await client.GetByteArrayAsync(imgUrl);
                await imgBuffer.DownloadAsync(signaturePath);

                // 添加水印
                await signaturePath.AddWatermarkAndSaveItAsync();

                // 保存调用记录
                var entity = new Domain.Signature.Signature
                {
                    Name = input.Name,
                    Type = type,
                    Url = signaturePicName,
                    Ip = ip,
                    CreateTime = DateTime.Now
                };
                await _signatureRepository.InsertAsync(entity);

                result.IsSuccess(entity.Url);
                return result;
            });
        }

        /// <summary>
        /// 获取个性签名调用记录
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<SignatureDto>>> GetSignaturesAsync(int count)
        {
            return await _signatureCacheService.GetSignaturesAsync(count, async () =>
            {
                var result = new ServiceResult<IEnumerable<SignatureDto>>();

                var list = _signatureRepository.OrderByDescending(x => x.CreateTime).Take(count).ToList();

                var signatures = ObjectMapper.Map<IEnumerable<Domain.Signature.Signature>, List<SignatureDto>>(list);
                signatures.ForEach(x => x.Name = x.Name.Sub(1) + "**");

                result.IsSuccess(signatures);
                return await Task.FromResult(result);
            });
        }

        /// <summary>
        /// 获取所有签名类型
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetSignatureTypesAsync()
        {
            return await _signatureCacheService.GetSignatureTypesAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<EnumResponse>>();

                var types = typeof(SignatureEnum).TryToList();
                result.IsSuccess(types);

                return await Task.FromResult(result);
            });
        }
    }
}
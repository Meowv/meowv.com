using Meowv.Blog.Caching.Signatures;
using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Signatures.Repositories;
using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Signatures.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Meowv.Blog.Signatures.Impl
{
    public partial class SignatureService : ServiceBase, ISignatureService
    {
        private readonly ISignatureRepository _signatures;
        private readonly IHttpClientFactory _httpClient;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ISignatureCacheService _cache;
        private readonly SignatureOptions _signatureOptions;

        public SignatureService(ISignatureRepository signatures,
                                IHttpClientFactory httpClient,
                                IHttpContextAccessor httpContextAccessor,
                                ISignatureCacheService cache,
                                IOptions<SignatureOptions> signatureOptions)
        {
            _signatures = signatures;
            _httpClient = httpClient;
            _httpContextAccessor = httpContextAccessor;
            _cache = cache;
            _signatureOptions = signatureOptions.Value;
        }

        /// <summary>
        /// Get the list of signature types.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/signature/types")]
        public async Task<BlogResponse<List<SignatureTypeDto>>> GetTypesAsync()
        {
            return await _cache.GetTypesAsync(async () =>
            {
                var response = new BlogResponse<List<SignatureTypeDto>>();

                var result = Signature.KnownTypes.Dictionary.Select(x => new SignatureTypeDto
                {
                    Type = x.Key,
                    TypeId = x.Value
                }).ToList();

                response.Result = result;
                return await Task.FromResult(response);
            });
        }

        /// <summary>
        /// Generate a signature.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/signature/generate")]
        public async Task<BlogResponse<string>> GenerateAsync(GenerateSignatureInput input)
        {
            return await _cache.GenerateAsync(input, async () =>
            {
                var response = new BlogResponse<string>();

                var ip = _httpContextAccessor.HttpContext.Request.Headers["X-Real-IP"].FirstOrDefault() ??
                         _httpContextAccessor.HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault() ??
                         _httpContextAccessor.HttpContext.Connection.RemoteIpAddress.MapToIPv4().ToString();

                var type = Signature.KnownTypes.Dictionary.FirstOrDefault(x => x.Value == input.TypeId).Key;
                if (type.IsNullOrEmpty())
                {
                    response.IsFailed($"The signature type not exists.");
                    return response;
                }

                var signature = await _signatures.FindAsync(x => x.Name == input.Name && x.Type == type);
                if (signature is not null)
                {
                    response.Result = signature.Url;
                    return response;
                }

                var api = _signatureOptions.Urls
                                           .OrderBy(x => GuidGenerator.Create())
                                           .Select(x => new { Url = x.Key, Param = string.Format(x.Value, input.Name, input.TypeId) })
                                           .FirstOrDefault();

                var content = new StringContent(api.Param);
                content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");
                using var client = _httpClient.CreateClient();
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
                var httpResponse = await client.PostAsync(api.Url, content);
                var httpResult = await httpResponse.Content.ReadAsStringAsync();

                var regex = new Regex(@"<img\b[^<>]*?\bsrc[\s\t\r\n]*=[\s\t\r\n]*[""']?[\s\t\r\n]*(?<imgUrl>[^\s\t\r\n""'<>]*)[^<>]*?/?[\s\t\r\n]*>", RegexOptions.IgnoreCase);
                var imgUrl = regex.Match(httpResult).Groups["imgUrl"].Value;

                var url = $"{$"{input.Name}_{type}".ToMd5()}.png";
                var signaturePath = Path.Combine(_signatureOptions.Path, url);

                var imgBuffer = await client.GetByteArrayAsync(imgUrl);
                await imgBuffer.DownloadAsync(signaturePath);

                await _signatures.InsertAsync(new Signature
                {
                    Name = input.Name,
                    Type = type,
                    Url = url,
                    Ip = ip
                });

                response.Result = url;
                return response;
            });
        }
    }
}
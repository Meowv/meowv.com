using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.Domain.Shared.Enum;
using Meowv.Blog.Domain.Signature.Repositories;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using Microsoft.AspNetCore.Http;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Signature.Impl
{
    public class SignatureService : MeowvBlogApplicationServiceBase, ISignatureService
    {
        private readonly ISignatureRepository _signatureRepository;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IHttpClientFactory _httpClient;

        public SignatureService(ISignatureRepository signatureRepository,
                                IHttpContextAccessor httpContextAccessor,
                                IHttpClientFactory httpClient)
        {
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
            var sign = (input.Name + input.Id + input.Timestamp).EncodeMd5String();
            if (input.Sign != sign.ToLower())
            {
                result.IsFailed("验签不正确");
                return result;
            }

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

            var signatureUrl = $"{sign}.png";

            // TODO:生成签名图片

            result.IsSuccess(ip);
            return result;
        }
    }
}
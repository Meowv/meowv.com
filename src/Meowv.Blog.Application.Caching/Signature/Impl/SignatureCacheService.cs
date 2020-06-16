using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Signature.Impl
{
    public class SignatureCacheService : CachingServiceBase, ISignatureCacheService
    {
        private const string KEY_GenerateSignature = "Signature:GenerateSignature-{0}-{1}";

        private const string KEY_GetSignatures = "Signature:GetSignatures-{0}";

        private const string KEY_GetSignatureTypes = "Signature:GetSignatureTypes";

        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GenerateSignatureAsync(GenerateSignatureInput input, Func<Task<ServiceResult<string>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GenerateSignature.FormatWith(input.Name, input.Id), factory, CacheStrategy.ONE_HOURS);
        }

        /// <summary>
        /// 获取个性签名调用记录
        /// </summary>
        /// <param name="count"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<SignatureDto>>> GetSignaturesAsync(int count, Func<Task<ServiceResult<IEnumerable<SignatureDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetSignatures.FormatWith(count), factory, CacheStrategy.ONE_MINUTE);
        }

        /// <summary>
        /// 获取所有签名类型
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetSignatureTypesAsync(Func<Task<ServiceResult<IEnumerable<EnumResponse>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetSignatureTypes, factory, CacheStrategy.NEVER);
        }
    }
}
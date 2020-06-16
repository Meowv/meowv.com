using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Signature
{
    public interface ISignatureCacheService
    {
        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> GenerateSignatureAsync(GenerateSignatureInput input, Func<Task<ServiceResult<string>>> factory);

        /// <summary>
        /// 获取个性签名调用记录
        /// </summary>
        /// <param name="count"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<SignatureDto>>> GetSignaturesAsync(int count, Func<Task<ServiceResult<IEnumerable<SignatureDto>>>> factory);

        /// <summary>
        /// 获取所有签名类型
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EnumResponse>>> GetSignatureTypesAsync(Func<Task<ServiceResult<IEnumerable<EnumResponse>>>> factory);
    }
}
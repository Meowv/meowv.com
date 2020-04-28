using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Signature
{
    public interface ISignatureService
    {
        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> GenerateSignatureAsync(GenerateSignatureInput input);

        /// <summary>
        /// 获取个性签名调用记录
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<SignatureDto>>> GetSignaturesAsync(int count);

        /// <summary>
        /// 获取所有签名类型
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EnumResponse>>> GetSignatureTypesAsync();
    }
}
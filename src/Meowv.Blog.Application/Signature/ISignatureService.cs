using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.ToolKits.Base;
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
    }
}
using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Signatures.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Signatures
{
    public partial interface ISignatureService
    {
        Task<BlogResponse<List<SignatureTypeDto>>> GetTypesAsync();

        Task<BlogResponse<string>> GenerateAsync(GenerateSignatureInput input);
    }
}
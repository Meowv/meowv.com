using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Signatures
{
    public partial interface ISignatureService
    {
        Task<BlogResponse<PagedList<SignatureDto>>> GetSignaturesAsync(int page, int limit);
    }
}
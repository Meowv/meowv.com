using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Authorize
{
    public interface IAuthorizeService
    {
        Task<BlogResponse<string>> GenerateTokenByAccountAsync(AccountInput input);
    }
}
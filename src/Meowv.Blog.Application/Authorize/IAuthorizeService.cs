using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Authorize
{
    public interface IAuthorizeService
    {
        Task<BlogResponse<string>> GetAuthorizeUrlAsync(string type);

        Task<BlogResponse<string>> GenerateTokenAsync(string type, string code, string state);

        Task<BlogResponse<string>> GenerateTokenAsync(AccountInput input);
    }
}
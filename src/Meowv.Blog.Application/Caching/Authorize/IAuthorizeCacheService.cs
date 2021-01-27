using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Authorize
{
    public interface IAuthorizeCacheService
    {
        Task AddAuthorizeCodeAsync(string code);

        Task<string> GetAuthorizeCodeAsync();
    }
}
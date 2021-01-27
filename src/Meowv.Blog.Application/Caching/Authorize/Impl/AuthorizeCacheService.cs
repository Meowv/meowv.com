using Microsoft.Extensions.Caching.Distributed;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Authorize.Impl
{
    public class AuthorizeCacheService : CachingServiceBase, IAuthorizeCacheService
    {
        public async Task AddAuthorizeCodeAsync(string code)
        {
            await Cache.SetStringAsync(CachingConsts.CachePrefix.Authorize, code);
        }

        public async Task<string> GetAuthorizeCodeAsync()
        {
            return await Cache.GetStringAsync(CachingConsts.CachePrefix.Authorize);
        }
    }
}
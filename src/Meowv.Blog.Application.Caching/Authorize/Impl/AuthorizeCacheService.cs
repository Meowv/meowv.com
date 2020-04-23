using Meowv.Blog.ToolKits.Base;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Authorize.Impl
{
    public class AuthorizeCacheService : ITransientDependency, IAuthorizeCacheService
    {
        public readonly IDistributedCache _cache;

        public AuthorizeCacheService(IDistributedCache cache)
        {
            _cache = cache;
        }

        public const string KEY_GetLoginAddress = "Authorize:GetLoginAddress";

        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLoginAddressAsync(Func<Task<ServiceResult<string>>> factory)
        {
            return await _cache.GetOrAddAsync(KEY_GetLoginAddress, factory, CacheStrategy.NEVER);
        }
    }
}
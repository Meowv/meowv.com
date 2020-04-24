using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
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

        private const string KEY_GetLoginAddress = "Authorize:GetLoginAddress";

        private const string KEY_GetAccessToken = "Authorize:GetAccessToken-{0}";

        private const string KEY_GenerateToken = "Authorize:GenerateToken-{0}";

        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLoginAddressAsync(Func<Task<ServiceResult<string>>> factory)
        {
            return await _cache.GetOrAddAsync(KEY_GetLoginAddress, factory, CacheStrategy.NEVER);
        }

        /// <summary>
        /// 获取AccessToken
        /// </summary>
        /// <param name="code"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetAccessTokenAsync(string code, Func<Task<ServiceResult<string>>> factory)
        {
            return await _cache.GetOrAddAsync(KEY_GetAccessToken.FormatWith(code), factory, CacheStrategy.FIVE_MINUTES);
        }

        /// <summary>
        /// 登录成功，生成Token
        /// </summary>
        /// <param name="access_token"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GenerateTokenAsync(string access_token, Func<Task<ServiceResult<string>>> factory)
        {
            return await _cache.GetOrAddAsync(KEY_GenerateToken.FormatWith(access_token), factory, CacheStrategy.ONE_HOURS);
        }
    }
}
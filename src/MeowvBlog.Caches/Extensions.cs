using EasyCaching.Core;
using EasyCaching.Core.Configurations;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace MeowvBlog.Caches
{
    /// <summary>
    /// EasyCaching Extension
    /// </summary>
    public static class Extensions
    {
        /// <summary>
        /// 注册EasyCaching缓存
        /// </summary>
        /// <param name="services"></param>
        /// <param name="configAction"></param>
        public static void AddCache(this IServiceCollection services, Action<EasyCachingOptions> configAction)
        {
            services.AddTransient<ICache, EasyCaching>();
            services.AddEasyCaching(configAction);
        }
    }
}
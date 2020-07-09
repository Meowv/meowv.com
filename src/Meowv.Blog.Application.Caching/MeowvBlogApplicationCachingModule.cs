using Meowv.Blog.Application.Contracts;
using Meowv.Blog.Application.EventBus;
using Meowv.Blog.Domain;
using Meowv.Blog.Domain.Configurations;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Redis;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Caching;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application.Caching
{
    [DependsOn(
        typeof(AbpCachingModule),
        typeof(MeowvBlogDomainModule),
        typeof(MeowvBlogApplicationContractsModule),
        typeof(MeowvBlogApplicationEventBusModule)
    )]
    public class MeowvBlogApplicationCachingModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            if (AppSettings.Caching.IsOpen)
            {
                context.Services.AddStackExchangeRedisCache(options =>
                {
                    options.Configuration = AppSettings.Caching.RedisConnectionString;
                });

                var csredis = new CSRedis.CSRedisClient(AppSettings.Caching.RedisConnectionString);
                RedisHelper.Initialization(csredis);

                context.Services.AddSingleton<IDistributedCache>(new CSRedisCache(RedisHelper.Instance));
            }
        }
    }
}
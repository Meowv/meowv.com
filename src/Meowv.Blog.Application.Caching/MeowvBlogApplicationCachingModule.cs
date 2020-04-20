using Meowv.Blog.Domain;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Caching;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application.Caching
{
    [DependsOn(
        typeof(AbpCachingModule),
        typeof(MeowvBlogDomainModule)
        )]
    public class MeowvBlogApplicationCachingModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.AddDistributedRedisCache(options =>
            {
                options.Configuration = "127.0.0.1:6379,password=123456,ConnectTimeout=15000,SyncTimeout=5000";
            });
        }
    }
}
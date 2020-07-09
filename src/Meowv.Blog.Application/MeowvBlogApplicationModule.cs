using Meowv.Blog.Application.Caching;
using Meowv.Blog.Application.EventBus;
using Volo.Abp.AutoMapper;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application
{
    [DependsOn(
        typeof(AbpIdentityApplicationModule),
        typeof(AbpAutoMapperModule),
        typeof(MeowvBlogApplicationCachingModule),
        typeof(MeowvBlogApplicationEventBusModule)
    )]
    public class MeowvBlogApplicationModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpAutoMapperOptions>(options =>
            {
                options.AddMaps<MeowvBlogApplicationModule>(validate: true);
                options.AddProfile<MeowvBlogAutoMapperProfile>(validate: true);
            });
        }
    }
}
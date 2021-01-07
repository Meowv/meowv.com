using Volo.Abp.Application;
using Volo.Abp.AutoMapper;
using Volo.Abp.Modularity;

namespace Meowv.Blog
{
    [DependsOn(
        typeof(AbpDddApplicationModule),
        typeof(AbpAutoMapperModule),
        typeof(MeowvBlogCoreModule)
    )]
    public class MeowvBlogApplicationModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpAutoMapperOptions>(options =>
            {
                options.AddMaps<MeowvBlogApplicationModule>();
                options.AddProfile<MeowvBlogApplicationAutoMapperProfile>();
            });
        }
    }
}
using Volo.Abp.AutoMapper;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace MeowvBlog
{
    [DependsOn(
        typeof(MeowvBlogDomainModule),
        typeof(MeowvBlogApplicationContractsModule),
        typeof(AbpIdentityApplicationModule)
        )]
    public class MeowvBlogApplicationModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpAutoMapperOptions>(options =>
            {
                options.AddMaps<MeowvBlogApplicationModule>();
            });
        }
    }
}
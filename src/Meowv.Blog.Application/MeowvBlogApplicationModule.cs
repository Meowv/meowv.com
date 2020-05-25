using Meowv.Blog.Application.Caching;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application
{
    [DependsOn(
        typeof(AbpIdentityApplicationModule),
        typeof(MeowvBlogApplicationCachingModule)
    )]
    public class MeowvBlogApplicationModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            
        }
    }
}
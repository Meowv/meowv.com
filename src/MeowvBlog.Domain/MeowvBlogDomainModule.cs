using MeowvBlog.Domain.Shared;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace MeowvBlog.Domain
{
    [DependsOn(
        typeof(MeowvBlogDomainSharedModule),
        typeof(AbpIdentityDomainModule)
    )]
    public class MeowvBlogDomainModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            base.ConfigureServices(context);
        }
    }
}
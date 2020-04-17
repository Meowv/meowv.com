using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace MeowvBlog
{
    [DependsOn(
        typeof(MeowvBlogDomainSharedModule),
        typeof(AbpIdentityDomainModule)
        )]
    public class MeowvBlogDomainModule : AbpModule
    {

    }
}
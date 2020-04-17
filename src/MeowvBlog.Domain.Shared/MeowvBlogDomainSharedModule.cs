using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace MeowvBlog
{
    [DependsOn(
        typeof(AbpIdentityDomainSharedModule)
        )]
    public class MeowvBlogDomainSharedModule : AbpModule
    {

    }
}
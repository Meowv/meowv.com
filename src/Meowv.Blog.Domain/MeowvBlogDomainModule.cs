using Meowv.Blog.Domain.Shared;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Domain
{
    [DependsOn(
        typeof(AbpIdentityDomainModule),
        typeof(MeowvBlogDomainSharedModule)
    )]
    public class MeowvBlogDomainModule : AbpModule
    {

    }
}
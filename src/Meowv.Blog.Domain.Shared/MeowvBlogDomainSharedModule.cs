using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Domain.Shared
{
    [DependsOn(typeof(AbpIdentityDomainSharedModule))]
    public class MeowvBlogDomainSharedModule : AbpModule
    {

    }
}
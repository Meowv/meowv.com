using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Domain
{
    [DependsOn(typeof(AbpIdentityDomainModule))]
    public class MeowvBlogDomainModule : AbpModule
    {

    }
}
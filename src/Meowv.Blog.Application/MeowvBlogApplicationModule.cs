using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application
{
    [DependsOn(typeof(AbpIdentityApplicationModule))]
    public class MeowvBlogApplicationModule : AbpModule
    {
    }
}
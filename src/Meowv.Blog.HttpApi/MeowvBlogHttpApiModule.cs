using Meowv.Blog.Application;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace Meowv.Blog.HttpApi
{
    [DependsOn(
        typeof(AbpIdentityHttpApiModule),
        typeof(MeowvBlogApplicationModule)
    )]
    public class MeowvBlogHttpApiModule : AbpModule
    {

    }
}
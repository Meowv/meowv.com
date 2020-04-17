using Volo.Abp.Identity;
using Volo.Abp.Modularity;

namespace MeowvBlog
{
    [DependsOn(
        typeof(MeowvBlogApplicationContractsModule),
        typeof(AbpIdentityHttpApiModule)
        )]
    public class MeowvBlogHttpApiModule : AbpModule
    {

    }
}
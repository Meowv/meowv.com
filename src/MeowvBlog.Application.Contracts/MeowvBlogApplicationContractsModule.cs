using Volo.Abp.Modularity;

namespace MeowvBlog
{
    [DependsOn(
        typeof(MeowvBlogDomainSharedModule)
    )]
    public class MeowvBlogApplicationContractsModule : AbpModule
    {

    }
}
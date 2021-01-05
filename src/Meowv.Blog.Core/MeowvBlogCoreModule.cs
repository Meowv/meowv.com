using Volo.Abp.Domain;
using Volo.Abp.Modularity;

namespace Meowv.Blog
{
    /// <summary>
    /// Core Module
    /// </summary>
    [DependsOn(typeof(AbpDddDomainModule))]
    public class MeowvBlogCoreModule : AbpModule
    {
    }
}
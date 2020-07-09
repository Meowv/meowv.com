using Meowv.Blog.Domain;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application.Contracts
{
    [DependsOn(typeof(MeowvBlogDomainModule))]
    public class MeowvBlogApplicationContractsModule : AbpModule
    {

    }
}
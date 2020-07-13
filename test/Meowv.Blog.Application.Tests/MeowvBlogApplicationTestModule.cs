using Meowv.Blog.Domain.Tests;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application.Tests
{
    [DependsOn(
        typeof(MeowvBlogApplicationModule),
        typeof(MeowvBlogDomainTestModule)
    )]
    public class MeowvBlogApplicationTestModule : AbpModule
    {
    }
}
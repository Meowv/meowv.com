using Meowv.Blog.EntityFrameworkCore.Tests.EntityFrameworkCore;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Domain.Tests
{
    [DependsOn(typeof(MeowvBlogEntityFrameworkCoreTestModule))]
    public class MeowvBlogDomainTestModule : AbpModule
    {
    }
}
using MeowvBlog.Core;
using Plus.EntityFramework;
using Plus.Modules;

namespace MeowvBlog.EntityFrameworkCore
{
    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(PlusEntityFrameworkModule)
    )]
    public class MeowvBlogEntityFrameworkCoreModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(typeof(MeowvBlogEntityFrameworkCoreModule).GetAssembly());
        }
    }
}
using Castle.MicroKernel.Registration;
using MeowvBlog.Core;
using MeowvBlog.Core.Configuration;
using Microsoft.EntityFrameworkCore;
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
        public override void PreInitialize()
        {
            var builder = new DbContextOptionsBuilder<MeowvBlogDbContext>();
            builder.UseMySql(AppSettings.MySqlConnectionString);

            IocManager.IocContainer.Register(
                Component
                    .For<DbContextOptions<MeowvBlogDbContext>>()
                    .Instance(builder.Options)
                    .LifestyleSingleton()
            );
        }

        public override void Initialize()
        {
            IocManager.RegisterAssembly(typeof(MeowvBlogEntityFrameworkCoreModule).GetAssembly());
        }
    }
}
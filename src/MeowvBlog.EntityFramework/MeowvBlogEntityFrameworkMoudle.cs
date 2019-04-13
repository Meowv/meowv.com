using Castle.MicroKernel.Registration;
using MeowvBlog.Core;
using MeowvBlog.Core.Configuration;
using Microsoft.EntityFrameworkCore;
using UPrime.EntityFramework;
using UPrime.Modules;

namespace MeowvBlog.EntityFramework
{
    [DependsOn(
        typeof(MeowvBlogCoreMoudle),
        typeof(UPrimeEntityFrameworkModule))]
    public class MeowvBlogEntityFrameworkMoudle : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(typeof(MeowvBlogEntityFrameworkMoudle).GetAssembly());
        }

        public override void PreInitialize()
        {
            // 注册EF DbContext
            var builder = new DbContextOptionsBuilder<MeowvBlogDbContext>();
            builder.UseMySql(AppSettings.MySqlConnectionString);
            //builder.UseSqlServer(AppSettings.SqlServerConnectionString);

            IocManager.IocContainer.Register(Component
                    .For<DbContextOptions<MeowvBlogDbContext>>()
                    .Instance(builder.Options)
                    .LifestyleSingleton());
        }
    }
}
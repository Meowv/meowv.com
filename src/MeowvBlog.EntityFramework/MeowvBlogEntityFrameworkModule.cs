using Castle.MicroKernel.Registration;
using MeowvBlog.Core;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using UPrime.EntityFramework;
using UPrime.Modules;

namespace MeowvBlog.EntityFramework
{
    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(UPrimeEntityFrameworkModule))]
    public class MeowvBlogEntityFrameworkModule : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(typeof(MeowvBlogEntityFrameworkModule).GetAssembly());
        }

        public override void PreInitialize()
        {
            // 注册EF DbContext
            var builder = new DbContextOptionsBuilder<MeowvBlogDbContext>();

            var dbType = AppSettings.DbType;
            if (dbType == GlobalConsts.DBTYPE_MYSQL)
            {
                builder.UseMySql(AppSettings.MySqlConnectionString);
            }
            if (dbType == GlobalConsts.DBTYPE_SQLSERVER)
            {
                builder.UseSqlServer(AppSettings.SqlServerConnectionString);
            }

            IocManager.IocContainer.Register(Component
                    .For<DbContextOptions<MeowvBlogDbContext>>()
                    .Instance(builder.Options)
                    .LifestyleSingleton());
        }
    }
}
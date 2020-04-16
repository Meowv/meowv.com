using MeowvBlog.EntityFrameworkCore;
using Volo.Abp.Autofac;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Modularity;

namespace MeowvBlog.DbMigrator
{
    [DependsOn(
        typeof(AbpAutofacModule),
        typeof(MeowvBlogEntityFrameworkCoreDbMigrationsModule),
        typeof(MeowvBlogApplicationContractsModule)
        )]
    public class MeowvBlogDbMigratorModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpBackgroundJobOptions>(options => options.IsJobExecutionEnabled = false);
        }
    }
}

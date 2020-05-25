using Hangfire;
using Hangfire.MySql.Core;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.Domain.Shared;
using Volo.Abp;
using Volo.Abp.BackgroundJobs.Hangfire;
using Volo.Abp.Modularity;

namespace Meowv.Blog.BackgroundJobs
{
    [DependsOn(typeof(AbpBackgroundJobsHangfireModule))]
    public class MeowvBlogBackgroundJobsModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.AddHangfire(config =>
            {
                config.UseStorage(
                    new MySqlStorage(AppSettings.ConnectionStrings,
                    new MySqlStorageOptions
                    {
                        TablePrefix = MeowvBlogConsts.DbTablePrefix + "hangfire"
                    }));
            });
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var service = context.ServiceProvider;
            
            app.UseHangfireServer();
            app.UseHangfireDashboard(options: new DashboardOptions
            {
                DashboardTitle = "任务调度中心"
            });

            // ...
            service.UseWallpaperJob();
        }
    }
}
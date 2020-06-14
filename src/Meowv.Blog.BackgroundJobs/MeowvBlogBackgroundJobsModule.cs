using Hangfire;
using Hangfire.Dashboard.BasicAuthorization;
using Hangfire.MySql.Core;
using Hangfire.SQLite;
using Hangfire.SqlServer;
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
                if (AppSettings.EnableDb == "MySQL")
                {
                    config.UseStorage(
                        new MySqlStorage(AppSettings.ConnectionStrings,
                        new MySqlStorageOptions
                        {
                            TablePrefix = MeowvBlogConsts.DbTablePrefix + "hangfire"
                        }));

                }
                else if (AppSettings.EnableDb == "Sqlite")
                {
                    config.UseSQLiteStorage(AppSettings.ConnectionStrings, new SQLiteStorageOptions
                    {
                        SchemaName = MeowvBlogConsts.DbTablePrefix + "hangfire"
                    });
                }
                else if (AppSettings.EnableDb == "SqlServer")
                {
                    config.UseSqlServerStorage(AppSettings.ConnectionStrings, new SqlServerStorageOptions
                    {
                        SchemaName = MeowvBlogConsts.DbTablePrefix + "hangfire"
                    });
                }
            });
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var service = context.ServiceProvider;

            app.UseHangfireServer();
            app.UseHangfireDashboard(options: new DashboardOptions
            {
                Authorization = new[]
                {
                    new BasicAuthAuthorizationFilter(new BasicAuthAuthorizationFilterOptions
                    {
                        RequireSsl = false,
                        SslRedirect = false,
                        LoginCaseSensitive = true,
                        Users = new []
                        {
                            new BasicAuthAuthorizationUser
                            {
                                Login = AppSettings.Hangfire.Login,
                                PasswordClear =  AppSettings.Hangfire.Password
                            }
                        }
                    })
                },
                DashboardTitle = "任务调度中心"
            });

            //service.UseWallpaperJob();

            //service.UseHotNewsJob();

            //service.UsePuppeteerTestJob();
        }
    }
}
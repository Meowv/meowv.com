using Hangfire;
using Meowv.Blog.BackgroundJobs.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp;

namespace Meowv.Blog.BackgroundJobs
{
    public static class MeowvBlogBackgroundJobsExtensions
    {
        public static void UseWallpaperJob(this ApplicationInitializationContext context)
        {
            var service = context.ServiceProvider.GetService<WallpaperJob>();

            RecurringJob.AddOrUpdate("接口测试", () => service.DoSomethingAsync(), CronType.Minute(1));
        }
    }
}
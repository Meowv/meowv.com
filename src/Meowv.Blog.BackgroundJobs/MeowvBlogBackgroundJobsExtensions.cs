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
            var job = context.ServiceProvider.GetService<WallpaperJob>();

            RecurringJob.AddOrUpdate("壁纸数据抓取", () => job.RunAsync(), CronType.Hour(1, 3));
        }

        public static void UseHotNewsJob(this ApplicationInitializationContext context)
        {
            var job = context.ServiceProvider.GetService<HotNewsJob>();

            RecurringJob.AddOrUpdate("每日热点数据抓取", () => job.RunAsync(), CronType.Hour(10, 2));
        }
    }
}
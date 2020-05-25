using Hangfire;
using Meowv.Blog.BackgroundJobs.Wallpaper;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace Meowv.Blog.BackgroundJobs
{
    public static class MeowvBlogBackgroundJobsExtensions
    {
        public static void UseWallpaperJob(this IServiceProvider service)
        {
            var job = service.GetService<WallpaperJobService>();

            RecurringJob.AddOrUpdate("壁纸数据抓取", () => job.ExecuteAsync(), CronType.Hour(1, 3));
        }
    }
}
using Hangfire;
using Meowv.Blog.BackgroundJobs.Jobs.HotNews;
using Meowv.Blog.BackgroundJobs.Jobs.PuppeteerTest;
using Meowv.Blog.BackgroundJobs.Jobs.Wallpapers;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace Meowv.Blog.BackgroundJobs
{
    public static class MeowvBlogBackgroundJobsExtensions
    {
        /// <summary>
        /// 壁纸数据抓取
        /// </summary>
        /// <param name="service"></param>
        public static void UseWallpaperJob(this IServiceProvider service)
        {
            var job = service.GetService<WallpaperJob>();

            RecurringJob.AddOrUpdate("壁纸数据抓取", () => job.ExecuteAsync(), CronType.Hour(1, 3));
        }

        /// <summary>
        /// 每日热点数据抓取
        /// </summary>
        /// <param name="context"></param>
        public static void UseHotNewsJob(this IServiceProvider service)
        {
            var job = service.GetService<HotNewsJob>();

            RecurringJob.AddOrUpdate("每日热点数据抓取", () => job.ExecuteAsync(), CronType.Hour(1, 2));
        }

        /// <summary>
        /// PuppeteerTest
        /// </summary>
        /// <param name="context"></param>
        public static void UsePuppeteerTestJob(this IServiceProvider service)
        {
            var job = service.GetService<PuppeteerTestJob>();

            BackgroundJob.Enqueue(() => job.ExecuteAsync());
        }
    }
}
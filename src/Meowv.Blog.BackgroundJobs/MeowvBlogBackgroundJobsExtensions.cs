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

            var job =  service.DoSomethingAsync();

            RecurringJob.AddOrUpdate("接口测试", () => job, CronType.Minute(1));
        }
    }
}
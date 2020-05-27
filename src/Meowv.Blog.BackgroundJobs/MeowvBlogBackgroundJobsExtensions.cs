using Hangfire;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace Meowv.Blog.BackgroundJobs
{
    public static class MeowvBlogBackgroundJobsExtensions
    {
        public static void UseSpider(this IServiceProvider service)
        {
            //var job = service.GetService<Spider>();

            //RecurringJob.AddOrUpdate("Spider", () => job.ExecuteAsync(), CronType.Hour());
        }
    }
}
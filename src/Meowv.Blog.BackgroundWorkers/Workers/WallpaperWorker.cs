using Meowv.Blog.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Quartz;
using System.Threading.Tasks;
using Volo.Abp.BackgroundWorkers.Quartz;

namespace Meowv.Blog.Workers
{
    public class WallpaperWorker : QuartzBackgroundWorkerBase
    {
        public WallpaperWorker(IOptions<BackgroundWorkerOptions> backgroundWorkerOptions)
        {
            JobDetail = JobBuilder.Create<WallpaperWorker>().WithIdentity(nameof(WallpaperWorker)).Build();

            Trigger = TriggerBuilder.Create()
                                    .WithIdentity(nameof(WallpaperWorker))
                                    .WithCronSchedule(backgroundWorkerOptions.Value.WallpaperCron)
                                    .Build();

            ScheduleJob = async scheduler =>
            {
                if (!await scheduler.CheckExists(JobDetail.Key))
                {
                    await scheduler.ScheduleJob(JobDetail, Trigger);
                }
            };
        }

        public override Task Execute(IJobExecutionContext context)
        {
            Logger.LogInformation("执行任务，抓取壁纸!");
            return Task.CompletedTask;
        }
    }
}
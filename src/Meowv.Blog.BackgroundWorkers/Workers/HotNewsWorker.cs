using Meowv.Blog.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Quartz;
using System.Threading.Tasks;
using Volo.Abp.BackgroundWorkers.Quartz;

namespace Meowv.Blog.Workers
{
    public class HotNewsWorker : QuartzBackgroundWorkerBase
    {
        public HotNewsWorker(IOptions<BackgroundWorkerOptions> backgroundWorkerOptions)
        {
            JobDetail = JobBuilder.Create<HotNewsWorker>().WithIdentity(nameof(HotNewsWorker)).Build();

            Trigger = TriggerBuilder.Create()
                                    .WithIdentity(nameof(HotNewsWorker))
                                    .WithCronSchedule(backgroundWorkerOptions.Value.HotNewsCron)
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
            Logger.LogInformation("执行任务，抓取热点新闻!");
            return Task.CompletedTask;
        }
    }
}
using Meowv.Blog.Domain.News.Repositories;
using Meowv.Blog.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Quartz;
using System.Threading.Tasks;
using Volo.Abp.BackgroundWorkers.Quartz;

namespace Meowv.Blog.Workers
{
    public class HotWorker : QuartzBackgroundWorkerBase
    {
        private readonly IHotRepository _hots;

        public HotWorker(IOptions<WorkerOptions> backgroundWorkerOptions, IHotRepository hots)
        {
            JobDetail = JobBuilder.Create<HotWorker>().WithIdentity(nameof(HotWorker)).Build();

            Trigger = TriggerBuilder.Create()
                                    .WithIdentity(nameof(HotWorker))
                                    .WithCronSchedule(backgroundWorkerOptions.Value.Cron)
                                    .Build();

            ScheduleJob = async scheduler =>
            {
                if (!await scheduler.CheckExists(JobDetail.Key))
                {
                    await scheduler.ScheduleJob(JobDetail, Trigger);
                }
            };
        }

        public override async Task Execute(IJobExecutionContext context)
        {
            Logger.LogInformation("开始抓取热点数据...");

            //var tasks = new List<Task<HotItem<object>>>();
            //var web = new HtmlWeb();

            //foreach (var item in Hot.KnownSources.Dictionary)
            //{
            //    var task = await Task.Factory.StartNew(async () =>
            //    {
            //        var result = await web.LoadFromWebAsync(item.Value);

            //        return new HotItem<object>
            //        {
            //            Source = item.Key,
            //            Result = result
            //        };
            //    });
            //    tasks.Add(task);
            //}
            //Task.WaitAll(tasks.ToArray());

            //var hots = new List<Hot>();

            //foreach (var task in tasks)
            //{
            //    var item = await task;
            //    var source = item.Source;
            //    var result = item.Result;

            //    if (source == Hot.KnownSources.cnblogs)
            //    {
            //        var html = result as HtmlDocument;
            //        var nodes = html.DocumentNode.SelectNodes("//div[@class='post_item_body']/h3/a").ToList();

            //        var hot = new Hot() { Source = source };

            //        nodes.ForEach(x =>
            //        {
            //            hot.Datas.Add(new Data
            //            {
            //                Title = x.InnerText,
            //                Url = x.GetAttributeValue("href", string.Empty)
            //            });
            //        });

            //        hots.Add(hot);

            //        Logger.LogInformation($"成功抓取：{source}，{hot.Datas.Count} 条数据.");
            //    }
            //}

            //if (hots.Any())
            //{
            //    await _hots.BulkInsertAsync(hots);
            //}

            Logger.LogInformation("热点数据抓取结束...");
            await Task.CompletedTask;
        }
    }
}
using Microsoft.Extensions.Hosting;
using PuppeteerSharp;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MeowvBlog.API.Jobs
{
    public class RemindJob : BackgroundService
    {
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                // 初始化浏览器
                await new BrowserFetcher().DownloadAsync(BrowserFetcher.DefaultRevision);

                // 访问指定页面保存为图片
                using (var browser = await Puppeteer.LaunchAsync(new LaunchOptions { Headless = true }))
                {
                    using var page = await browser.NewPageAsync();
                    await page.GoToAsync("https://github.com/Meowv");
                    await page.ScreenshotAsync(@"D:\meowv.png", new ScreenshotOptions
                    {
                        FullPage = true,
                        Type = ScreenshotType.Png
                    });
                }

                Console.WriteLine("qix:" + DateTime.Now);

                await Task.Delay(10000, stoppingToken);
            }
        }
    }
}
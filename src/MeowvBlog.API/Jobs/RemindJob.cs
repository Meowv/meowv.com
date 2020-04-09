using MeowvBlog.API.Configurations;
using Microsoft.Extensions.Hosting;
using PuppeteerSharp;
using System;
using System.IO;
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
                if (DateTime.Now.Hour >= AppSettings.Job.ExecutionTime)
                {
                    #region 访问指定URL,保存为图片

                    var path = Path.Combine(Path.GetTempPath(), "meowv.png");

                    await new BrowserFetcher().DownloadAsync(BrowserFetcher.DefaultRevision);
                    using var browser = await Puppeteer.LaunchAsync(new LaunchOptions { Headless = true });
                    using var page = await browser.NewPageAsync();

                    await page.SetViewportAsync(new ViewPortOptions
                    {
                        Width = 1920,
                        Height = 1080
                    });
                    await page.GoToAsync("https://github.com/Meowv");
                    await page.ScreenshotAsync(path, new ScreenshotOptions
                    {
                        FullPage = true,
                        Type = ScreenshotType.Png
                    });

                    #endregion

                    Console.WriteLine(path);

                    // 延迟执行
                    await Task.Delay(AppSettings.Job.MillisecondsDelay, stoppingToken);
                }
            }
        }
    }
}
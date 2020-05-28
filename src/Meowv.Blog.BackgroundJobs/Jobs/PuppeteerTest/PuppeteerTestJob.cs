using PuppeteerSharp;
using System.Threading.Tasks;

namespace Meowv.Blog.BackgroundJobs.Jobs.PuppeteerTest
{
    public class PuppeteerTestJob : IBackgroundJob
    {
        public async Task ExecuteAsync()
        {
            await new BrowserFetcher().DownloadAsync(BrowserFetcher.DefaultRevision);

            using var browser = await Puppeteer.LaunchAsync(new LaunchOptions
            {
                Headless = true,
                Args = new string[] { "--no-sandbox" }
            });

            using var page = await browser.NewPageAsync();

            await page.SetViewportAsync(new ViewPortOptions
            {
                Width = 1920,
                Height = 1080
            });

            var url = "https://meowv.com/wallpaper";
            await page.GoToAsync(url, WaitUntilNavigation.Networkidle0);
            
            var content = await page.GetContentAsync();

            await page.PdfAsync("meowv.pdf");
            await page.ScreenshotAsync("meowv.png", new ScreenshotOptions
            {
                FullPage = true,
                Type = ScreenshotType.Png
            });
        }
    }
}
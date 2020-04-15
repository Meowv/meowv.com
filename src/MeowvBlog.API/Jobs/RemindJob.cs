using MailKit.Net.Smtp;
using MeowvBlog.API.Configurations;
using Microsoft.Extensions.Hosting;
using MimeKit;
using MimeKit.Utils;
using PuppeteerSharp;
using System;
using System.IO;
using System.Linq;
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
                    await page.GoToAsync(AppSettings.Job.Url, WaitUntilNavigation.Networkidle0);
                    await page.ScreenshotAsync(path, new ScreenshotOptions
                    {
                        FullPage = true,
                        Type = ScreenshotType.Png
                    });
                   
                    #endregion

                    #region 发送Email

                    var message = new MimeMessage();

                    message.From.Add(new MailboxAddress(AppSettings.Email.From.Name, AppSettings.Email.From.Address));
                    var address = AppSettings.Email.To.Select(x => new MailboxAddress(x.Key, x.Value));
                    message.To.AddRange(address);
                    message.Subject = AppSettings.Email.Subject;

                    var builder = new BodyBuilder();

                    var image = builder.LinkedResources.Add(path);
                    image.ContentId = MimeUtils.GenerateMessageId();

                    builder.HtmlBody = string.Format("<img src=\"cid:{0}\"/>", image.ContentId);
                    message.Body = builder.ToMessageBody();

                    using (var client = new SmtpClient())
                    {
                        client.ServerCertificateValidationCallback = (s, c, h, e) => true;
                        client.AuthenticationMechanisms.Remove("XOAUTH2");

                        await client.ConnectAsync(AppSettings.Email.Host, AppSettings.Email.Port, AppSettings.Email.UseSsl);
                        await client.AuthenticateAsync(AppSettings.Email.From.Username, AppSettings.Email.From.Password);
                        await client.SendAsync(message);
                        await client.DisconnectAsync(true);
                    }

                    #endregion

                    // 延迟执行
                    await Task.Delay(AppSettings.Job.MillisecondsDelay, stoppingToken);
                }
            }
        }
    }
}
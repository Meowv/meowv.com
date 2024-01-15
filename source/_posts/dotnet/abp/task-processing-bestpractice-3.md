---
title: 定时任务最佳实战（三）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-01 09:02:01
categories: .NET
tags:
  - .NET Core
  - abp vNext
  - PuppeteerSharp
  - MailKit
  - 定时任务
---

上一篇完成了全网各大平台的热点新闻数据的抓取，本篇继续围绕抓取完成后的操作做一个提醒。当每次抓取完数据后，自动发送邮件进行提醒。

在开始正题之前还是先玩一玩之前的说到却没有用到的一个库`PuppeteerSharp`。

`PuppeteerSharp`：Headless Chrome .NET API ，它运用最多的应该是自动化测试和抓取异步加载的网页数据，更多介绍可以看 GitHub：<https://github.com/hardkoded/puppeteer-sharp> 。

我这里主要来试试它的异步抓取功能，同时它还能帮我们生成网页截图或者 PDF。

如果没有安装可以先安装一下，在`.BackgroundJobs`层安装`PuppeteerSharp`：`Install-Package PuppeteerSharp`

在 Jobs 文件夹下新建一个`PuppeteerTestJob.cs`，继承`IBackgroundJob`，同样是在`ExecuteAsync()`方法中执行操作。

```csharp
//PuppeteerTestJob.cs
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.BackgroundJobs.Jobs.PuppeteerTest
{
    public class PuppeteerTestJob : IBackgroundJob
    {
        public async Task ExecuteAsync()
        {
            throw new NotImplementedException();
        }
    }
}
```

使用 `await new BrowserFetcher().DownloadAsync(BrowserFetcher.DefaultRevision);` 第一次检测到没有浏览器文件会默认帮我们下载 chromium 浏览器。

`DownloadAsync(...)`可以指定 Chromium 版本，`BrowserFetcher.DefaultRevision` 下载当前默认最稳定的版本。

然后配置浏览器启动的方式。

```csharp
using var browser = await Puppeteer.LaunchAsync(new LaunchOptions
{
    Headless = true,
    Args = new string[] { "--no-sandbox" }
});
```

感兴趣的可以自己看看`LaunchOptions`有哪些参数，我这里指定了`Headless = true` 以无头模式运行浏览器，然后加了一个启动参数 "--no-sandbox"。针对 Linux 环境下，如果是运行在 root 权限下，在启动 Puppeteer 时要添加 "--no-sandbox" 参数，否则 Chromium 会启动失败。

我们打开一个异步加载的网页，然后获取到页面加载完后的 HTML，以我个人博客中的某个单页为例：<https://meowv.com/wallpaper> 。

```csharp
//PuppeteerTestJob.cs
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
        }
    }
}
```

`page.SetViewportAsync()`设置网页预览大小，`page.GoToAsync()`语法打开网页，`WaitUntilNavigation.Networkidle0`等待网页加载完毕，使用`page.GetContentAsync()`获取到 HTML。

新建扩展方法，调用这个`PuppeteerTestJob`的`ExecuteAsync()`方法，调试看看效果。

![ ](/images/abp/task-processing-bestpractice-3-01.png)

HTML 已经出来了，此时该干嘛就干嘛就可以了。

第一次运行可能会很慢，因为如果你本地不存在 Chromium 是会去帮我们下载的，因为网络原因可能会下载的很慢，所以推荐大家手动下载。

可以使用淘宝的源：<https://npm.taobao.org/mirrors/chromium-browser-snapshots/> 。

要注意的是，下载完成后的解压的路径不能出错，默认下载地址是在启动目录下面。

Windows：`..\.local-chromium\Win64-706915\chrome-win` 、 Linux：`../.local-chromium/Linux-706915/chrome-linux`

接下来试试生成 PDF 和保存图片功能，使用方式也很简单。

```csharp
await page.PdfAsync("meowv.pdf",new PdfOptions { });
await page.ScreenshotAsync("meowv.png", new ScreenshotOptions
{
    FullPage = true,
    Type = ScreenshotType.Png
});
```

这里只做简单的展示，`page.PdfAsync()`直接生成 PDF 文件，同时还有很多方法可以自己调用`page.`试试，`PdfOptions`选项中可以设置各种参数。

`page.ScreenshotAsync()`保存图片，`ScreenshotOptions`中 FullPage 可以设置保存图片为全屏模式，图片格式为 Png 类型。

![ ](/images/abp/task-processing-bestpractice-3-02.png)

可以看到项目根目录已经生成了图片和 PDF，感觉去试试吧。

接下里来实现发送邮件的功能。

我这里发邮件的账号是用的腾讯企业邮箱，也可以用普通邮箱开通 SMTP 服务即可。

在`appsettings.json`配置收发邮件的账号等信息。

```json
//appsettings.json
  "Email": {
    "Host": "smtp.exmail.qq.com",
    "Port": 465,
    "UseSsl": true,
    "From": {
      "Username": "123@meowv.com",
      "Password": "[Password]",
      "Name": "MEOWV.COM",
      "Address": "123@meowv.com"
    },
    "To": [
      {
        "Name": "test1",
        "Address": "test1@meowv.com"
      },
      {
        "Name": "test2",
        "Address": "test2@meowv.com"
      }
    ]
  }
```

然后再`AppSettings`中读取配置的项。

```csharp
//AppSettings.cs
public static class Email
{
    /// <summary>
    /// Host
    /// </summary>
    public static string Host => _config["Email:Host"];

    /// <summary>
    /// Port
    /// </summary>
    public static int Port => Convert.ToInt32(_config["Email:Port"]);

    /// <summary>
    /// UseSsl
    /// </summary>
    public static bool UseSsl => Convert.ToBoolean(_config["Email:UseSsl"]);

    /// <summary>
    /// From
    /// </summary>
    public static class From
    {
        /// <summary>
        /// Username
        /// </summary>
        public static string Username => _config["Email:From:Username"];

        /// <summary>
        /// Password
        /// </summary>
        public static string Password => _config["Email:From:Password"];

        /// <summary>
        /// Name
        /// </summary>
        public static string Name => _config["Email:From:Name"];

        /// <summary>
        /// Address
        /// </summary>
        public static string Address => _config["Email:From:Address"];
    }

    /// <summary>
    /// To
    /// </summary>
    public static IDictionary<string, string> To
    {
        get
        {
            var dic = new Dictionary<string, string>();

            var emails = _config.GetSection("Email:To");
            foreach (IConfigurationSection section in emails.GetChildren())
            {
                var name = section["Name"];
                var address = section["Address"];

                dic.Add(name, address);
            }
            return dic;
        }
    }
}
```

分别介绍下每项的含义：

- `Host`：发送邮件服务器地址。
- `Port`：服务器地址端口号。
- `UseSsl`：是否使用 SSL 方式。
- `From`：发件人的账号密码，名称及邮箱地址，一般邮箱地址和账号是相同的。
- `To`：收件人邮箱列表，也包含名称和邮箱地址。

收件人邮箱列表我将其读取为`IDictionary<string, string>`了，key 是名称，value 是邮箱地址。

接着在`.ToolKits`层添加一个`EmailHelper.cs`，收发邮件我选择了`MailKit`和`MailKit`两个库，没有安装的先安装一下，`Install-Package MailKit`、`Install-Package MimeKit`。

直接新建一个发送邮件的方法`SendAsync()`，按照要求将基本的配置信息填进去，然后直接调用即可。

```csharp
//EmailHelper.cs
using MailKit.Net.Smtp;
using Meowv.Blog.Domain.Configurations;
using MimeKit;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.ToolKits.Helper
{
    public static class EmailHelper
    {
        /// <summary>
        /// 发送Email
        /// </summary>
        /// <param name="message"></param>
        /// <returns></returns>
        public static async Task SendAsync(MimeMessage message)
        {
            if (!message.From.Any())
            {
                message.From.Add(new MailboxAddress(AppSettings.Email.From.Name, AppSettings.Email.From.Address));
            }
            if (!message.To.Any())
            {
                var address = AppSettings.Email.To.Select(x => new MailboxAddress(x.Key, x.Value));
                message.To.AddRange(address);
            }

            using var client = new SmtpClient
            {
                ServerCertificateValidationCallback = (s, c, h, e) => true
            };
            client.AuthenticationMechanisms.Remove("XOAUTH2");

            await client.ConnectAsync(AppSettings.Email.Host, AppSettings.Email.Port, AppSettings.Email.UseSsl);
            await client.AuthenticateAsync(AppSettings.Email.From.Username, AppSettings.Email.From.Password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);
        }
    }
}
```

`SendAsync(...)`接收一个参数`MimeMessage`对象，这样就完成了一个通用的发邮件方法，接着我们去需要发邮件的地方构造`MimeMessage`，调用`SendAsync()`。

```csharp
//WallpaperJob.cs
...
    // 发送Email
    var message = new MimeMessage
    {
        Subject = "【定时任务】壁纸数据抓取任务推送",
        Body = new BodyBuilder
        {
            HtmlBody = $"本次抓取到{wallpapers.Count()}条数据，时间:{DateTime.Now:yyyy-MM-dd HH:mm:ss}"
        }.ToMessageBody()
    };
    await EmailHelper.SendAsync(message);
...
```

```csharp
//HotNewsJob.cs
...
    // 发送Email
    var message = new MimeMessage
    {
        Subject = "【定时任务】每日热点数据抓取任务推送",
        Body = new BodyBuilder
        {
            HtmlBody = $"本次抓取到{hotNews.Count()}条数据，时间:{DateTime.Now:yyyy-MM-dd HH:mm:ss}"
        }.ToMessageBody()
    };
    await EmailHelper.SendAsync(message);
...
```

分别在两个爬虫脚本中添加发送 Email，`MimeMessage`中设置了邮件主题`Subject`，正文`Body`，最后调用`await EmailHelper.SendAsync(message)`执行发送邮件操作。

编译运行执行两个定时任务，看看能否收到邮件提醒。

![ ](/images/abp/task-processing-bestpractice-3-03.png)

成功了，邮箱收到了两条提醒。

还有一种比较特殊的用法，也介绍一下，如果想要发送带图片的邮件怎么操作呢？注意不是附件，是将图片内嵌在邮箱中。

一般常规都是有邮件模板的，将图片的具体地址插入到 img 标签中，这就不说了，这里选择另外一种方式。以前面添加的`PuppeteerTestJob`为例，正好我们生成了一张图片的。将这种图片以邮件的形式发出去。

```csharp
public class PuppeteerTestJob : IBackgroundJob
{
    public async Task ExecuteAsync()
    {
        var path = Path.Combine(Path.GetTempPath(), "meowv.png");

        ...

        await page.ScreenshotAsync(path, new ScreenshotOptions
        {
            FullPage = true,
            Type = ScreenshotType.Png
        });

        // 发送带图片的Email
        var builder = new BodyBuilder();

        var image = builder.LinkedResources.Add(path);
        image.ContentId = MimeUtils.GenerateMessageId();

        builder.HtmlBody = "当前时间:{0}.<img src=\"cid:{1}\"/>".FormatWith(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), image.ContentId);

        var message = new MimeMessage
        {
            Subject = "【定时任务】每日热点数据抓取任务推送",
            Body = builder.ToMessageBody()
        };
        await EmailHelper.SendAsync(message);
    }
}
```

先确定我们生成图片的路径 path ，将图片生成 Message-Id，然后赋值给 ContentId，给模板中`<img src=\"cid:{1}\"/>`图片标签`cid`赋上值在调用发送邮件方法即可。

![ ](/images/abp/task-processing-bestpractice-3-04.png)

成功收到邮件，搞定了，你学会了吗？😁😁😁

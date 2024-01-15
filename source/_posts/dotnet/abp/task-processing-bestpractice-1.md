---
title: 定时任务最佳实战（一）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-05-29 08:49:29
categories: .NET
tags:
  - .NET Core
  - abp vNext
  - xpath
  - 定时任务
---

上一篇文章使用 AutoMapper 来处理对象与对象之间的映射关系，本篇主要围绕定时任务和数据抓取相关的知识点并结合实际应用，在定时任务中循环处理爬虫任务抓取数据。

开始之前可以删掉之前测试用的几个 HelloWorld，没有什么实际意义，直接干掉吧。抓取数据我主要用到了，`HtmlAgilityPack`和`PuppeteerSharp`，一般情况下`HtmlAgilityPack`就可以完成大部分的数据抓取需求了，当在抓取动态网页的时候可以用到`PuppeteerSharp`，同时`PuppeteerSharp`还支持将图片保存为图片和 PDF 等牛逼的功能。

关于这两个库就不多介绍了，不了解的请自行去学习。

先在`.BackgroundJobs`层安装两大神器：`Install-Package HtmlAgilityPack`、`Install-Package PuppeteerSharp`。我在使用 Package Manager 安装包的时候一般都不喜欢指定版本号，因为这样默认是给我安装最新的版本。

之前无意中发现爱思助手的网页版有很多手机壁纸(<https://www.i4.cn/wper_4_0_1_1.html)>，于是我就动了小心思，把所有手机壁纸全部抓取过来自嗨，可以看看我个人博客中的成品吧：<https://meowv.com/wallpaper> 😝😝😝

![ ](/images/abp/task-processing-bestpractice-1-01.png)

最开始我是用 Python 实现的，现在我们在.NET 中抓它。

我数了一下，一共有 20 个分类，直接在`.Domain.Shared`层添加一个壁纸分类的枚举`WallpaperEnum.cs`。

```csharp
//WallpaperEnum.cs
using System.ComponentModel;

namespace Meowv.Blog.Domain.Shared.Enum
{
    public enum WallpaperEnum
    {
        [Description("美女")]
        Beauty = 1,

        [Description("型男")]
        Sportsman = 2,

        [Description("萌娃")]
        CuteBaby = 3,

        [Description("情感")]
        Emotion = 4,

        [Description("风景")]
        Landscape = 5,

        [Description("动物")]
        Animal = 6,

        [Description("植物")]
        Plant = 7,

        [Description("美食")]
        Food = 8,

        [Description("影视")]
        Movie = 9,

        [Description("动漫")]
        Anime = 10,

        [Description("手绘")]
        HandPainted = 11,

        [Description("文字")]
        Text = 12,

        [Description("创意")]
        Creative = 13,

        [Description("名车")]
        Car = 14,

        [Description("体育")]
        PhysicalEducation = 15,

        [Description("军事")]
        Military = 16,

        [Description("节日")]
        Festival = 17,

        [Description("游戏")]
        Game = 18,

        [Description("苹果")]
        Apple = 19,

        [Description("其它")]
        Other = 20,
    }
}
```

查看原网页可以很清晰的看到，每一个分类对应了一个不同的 URL，于是手动创建一个抓取的列表，列表内容包括 URL 和分类，然后我又想用多线程来访问 URL，返回结果。新建一个通用的待抓项的类，起名为:`WallpaperJobItem.cs`，为了规范和后续的壁纸查询接口，我们放在`.Application.Contracts`层中。

```csharp
//WallpaperJobItem.cs
using Meowv.Blog.Domain.Shared.Enum;

namespace Meowv.Blog.Application.Contracts.Wallpaper
{
    public class WallpaperJobItem<T>
    {
        /// <summary>
        /// <see cref="Result"/>
        /// </summary>
        public T Result { get; set; }

        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperEnum Type { get; set; }
    }
}
```

`WallpaperJobItem<T>`接受一个参数 T，Result 的类型由 T 决定，在`.BackgroundJobs`层 Jobs 文件夹中新建一个任务，起名叫做：`WallpaperJob.cs`吧。老样子，继承`IBackgroundJob`。

```csharp
//WallpaperJob.cs
using Meowv.Blog.Application.Contracts.Wallpaper;
using Meowv.Blog.Domain.Shared.Enum;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.BackgroundJobs.Jobs.Wallpaper
{
    public class WallpaperJob : IBackgroundJob
    {
        public async Task ExecuteAsync()
        {
            var wallpaperUrls = new List<WallpaperJobItem<string>>
            {
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_1_1.html", Type = WallpaperEnum.Beauty },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_58_1.html", Type = WallpaperEnum.Sportsman },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_66_1.html", Type = WallpaperEnum.CuteBaby },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_4_1.html", Type = WallpaperEnum.Emotion },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_3_1.html", Type = WallpaperEnum.Landscape },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_9_1.html", Type = WallpaperEnum.Animal },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_13_1.html", Type = WallpaperEnum.Plant },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_64_1.html", Type = WallpaperEnum.Food },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_11_1.html", Type = WallpaperEnum.Movie },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_5_1.html", Type = WallpaperEnum.Anime },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_34_1.html", Type = WallpaperEnum.HandPainted },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_65_1.html", Type = WallpaperEnum.Text },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_2_1.html",  Type = WallpaperEnum.Creative },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_10_1.html", Type = WallpaperEnum.Car },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_14_1.html", Type = WallpaperEnum.PhysicalEducation },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_63_1.html", Type = WallpaperEnum.Military },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_17_1.html", Type = WallpaperEnum.Festival },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_15_1.html", Type = WallpaperEnum.Game },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_12_1.html", Type = WallpaperEnum.Apple },
                new WallpaperJobItem<string> { Result = "https://www.i4.cn/wper_4_19_7_1.html", Type = WallpaperEnum.Other }
            };
        }
    }
}
```

先构建一个要抓取的列表 wallpaperUrls，这里准备用 `HtmlAgilityPack`，默认只抓取第一页最新的数据。

```csharp
public async Task RunAsync()
{
    ...

    var web = new HtmlWeb();
    var list_task = new List<Task<WallpaperJobItem<HtmlDocument>>>();

    wallpaperUrls.ForEach(item =>
    {
        var task = Task.Run(async () =>
        {
            var htmlDocument = await web.LoadFromWebAsync(item.Result);
            return new WallpaperJobItem<HtmlDocument>
            {
                Result = htmlDocument,
                Type = item.Type
            };
        });
        list_task.Add(task);
    });
    Task.WaitAll(list_task.ToArray());
}
```

上面这段代码，先 new 了一个`HtmlWeb`对象，我们主要用这个对象去加载我们的 URL。

`web.LoadFromWebAsync(...)`，它会返回一个`HtmlDocument`对象，这样就和上面的 list_task 对应起来，从而也应证了前面添加的`WallpaperJobItem`是通用的一个待抓项的类。

循环处理 wallpaperUrls，等待所有请求完成。这样就拿到了 20 个`HtmlDocument`，和它的分类，接下来就可以去处理 list_task 就行了。

在开始处理之前，要想好抓到的图片数据存放在哪里？我这里还是选择存在数据库中，因为有了之前的自定义仓储之增删改查的经验，可以很快的处理这件事情。

添加实体类、自定义仓储、DbSet、Code-First 等一些列操作，就不一一介绍了，我相信看过之前文章的人都能完成这一步。

Wallpaper 实体类包含主键 Guid，标题 Title，图片地址 Url，类型 Type，和一个创建时间 CreateTime。

自定义仓储包含一个批量插入的方法：`BulkInsertAsync(...)`。

贴一下完成后的图片，就不上代码了，如果需要可以去 GitHub 获取。

![ ](/images/abp/task-processing-bestpractice-1-02.png)

回到`WallpaperJob`，因为我们要抓取的是图片，所以获取到 HTML 中的 img 标签就可以了。

![ ](/images/abp/task-processing-bestpractice-1-03.png)

查看源代码发现图片是一个列表呈现的，并且被包裹在`//article[@id='wper']/div[@class='jbox']/div[@class='kbox']`下面，学过 XPath 语法的就很容易了，关于 XPath 语法这里也不做介绍了，对于不会的这里有一篇快速入门的文章：<https://www.cnblogs.com/meowv/p/11310538.html> 。

利用 XPath Helper 工具我们在浏览器上模拟一下选择的节点是否正确。

![ ](/images/abp/task-processing-bestpractice-1-04.png)

使用`//article[@id='wper']/div[@class='jbox']/div[@class='kbox']/div/a/img`可以成功将图片高亮，说明我们的语法是正确的。

```csharp
public async Task RunAsync()
{
    ...

    var wallpapers = new List<Wallpaper>();

    foreach (var list in list_task)
    {
        var item = await list;

        var imgs = item.Result.DocumentNode.SelectNodes("//article[@id='wper']/div[@class='jbox']/div[@class='kbox']/div/a/img[1]").ToList();
        imgs.ForEach(x =>
        {
            wallpapers.Add(new Wallpaper
            {
                Url = x.GetAttributeValue("data-big", ""),
                Title = x.GetAttributeValue("title", ""),
                Type = (int)item.Type,
                CreateTime = x.Attributes["data-big"].Value.Split("/").Last().Split("_").First().TryToDateTime()
            });
        });
    }
    ...
}
```

在 foreach 循环中先拿到当前循环的 Item 对象，即`WallpaperJobItem<HtmlDocument>`。

通过`.DocumentNode.SelectNodes()`语法获取到图片列表，因为在 a 标签下面有两个 img 标签，取第一个即可。

`GetAttributeValue()`是`HtmlAgilityPack`的扩展方法，用于直接获取属性值。

在看图片的时候，发现图片地址的规则是根据时间戳生成的，于是用`TryToDateTime()`扩展方法将其处理转换成时间格式。

这样我们就将所有图片按分类存进了列表当中，接下来调用批量插入方法。

在构造函数中注入自定义仓储`IWallpaperRepository`。

```csharp
...
        private readonly IWallpaperRepository _wallpaperRepository;

        public WallpaperJob(IWallpaperRepository wallpaperRepository)
        {
            _wallpaperRepository = wallpaperRepository;
        }
...
```

```csharp
...
    var urls = (await _wallpaperRepository.GetListAsync()).Select(x => x.Url);
    wallpapers = wallpapers.Where(x => !urls.Contains(x.Url)).ToList();
    if (wallpapers.Any())
    {
        await _wallpaperRepository.BulkInsertAsync(wallpapers);
    }
```

因为抓取的图片可能存在重复的情况，我们需要做一个去重处理，先查询到数据库中的所有的 URL 列表，然后在判断抓取到的 url 是否存在，最后调用`BulkInsertAsync(...)`批量插入方法。

这样就完成了数据抓取的全部逻辑，在保存数据到数据库之后我们可以进一步操作，比如：写日志、发送邮件通知等等，这里大家自由发挥吧。

写一个扩展方法每隔 3 小时执行一次。

```csharp
...
    public static void UseWallpaperJob(this IServiceProvider service)
    {
        var job = service.GetService<WallpaperJob>();
        RecurringJob.AddOrUpdate("壁纸数据抓取", () => job.ExecuteAsync(), CronType.Hour(1, 3));
    }
...
```

最后在模块内中调用。

```csharp
...
    public override void OnApplicationInitialization(ApplicationInitializationContext context)
    {
        ...
        service.UseWallpaperJob();
    }
```

编译运行，打开 Hangfire 界面手动执行看看效果。

![ ](/images/abp/task-processing-bestpractice-1-05.png)

完美，数据库已经存入了不少数据了，还是要提醒一下：爬虫有风险，抓数需谨慎。

Hangfire 定时处理爬虫任务，用`HtmlAgilityPack`抓取数据后存入数据库，你学会了吗？😁😁😁

using HtmlAgilityPack;
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
    }
}
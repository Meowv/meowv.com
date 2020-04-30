using HtmlAgilityPack;
using Meowv.Blog.Application.Contracts.Wallpaper.Jobs;
using Meowv.Blog.Domain.Shared.Enum;
using Meowv.Blog.Domain.Wallpaper;
using Meowv.Blog.Domain.Wallpaper.Repositories;
using Meowv.Blog.ToolKits.Extensions;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.BackgroundJobs.Jobs
{
    public class WallpaperJob : ITransientDependency
    {
        private readonly IWallpaperRepository _wallpaperRepository;

        public WallpaperJob(IWallpaperRepository wallpaperRepository)
        {
            _wallpaperRepository = wallpaperRepository;
        }

        /// <summary>
        /// 壁纸数据抓取
        /// </summary>
        /// <returns></returns>
        public async Task RunAsync()
        {
            var wallpaperUrls = new List<WallpaperUrls>
            {
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_1_1.html", Type = WallpaperEnum.Beauty },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_58_1.html", Type = WallpaperEnum.Sportsman },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_66_1.html", Type = WallpaperEnum.CuteBaby },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_4_1.html", Type = WallpaperEnum.Emotion },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_3_1.html", Type = WallpaperEnum.Landscape },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_9_1.html", Type = WallpaperEnum.Animal },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_13_1.html", Type = WallpaperEnum.Plant },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_64_1.html", Type = WallpaperEnum.Food },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_11_1.html", Type = WallpaperEnum.Movie },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_5_1.html", Type = WallpaperEnum.Anime },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_34_1.html", Type = WallpaperEnum.HandPainted },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_65_1.html", Type = WallpaperEnum.Text },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_2_1.html",  Type = WallpaperEnum.Creative },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_10_1.html", Type = WallpaperEnum.Car },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_14_1.html", Type = WallpaperEnum.PhysicalEducation },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_63_1.html", Type = WallpaperEnum.Military },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_17_1.html", Type = WallpaperEnum.Festival },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_15_1.html", Type = WallpaperEnum.Game },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_12_1.html", Type = WallpaperEnum.Apple },
                new WallpaperUrls {Url= "https://www.i4.cn/wper_4_19_7_1.html", Type = WallpaperEnum.Other }
            };

            var web = new HtmlWeb();
            var list_task = new List<Task<WallpaperHtmlItem<HtmlDocument>>>();

            wallpaperUrls.ForEach(item =>
            {
                var task = Task.Run(async () =>
                {
                    var htmlDocument = await web.LoadFromWebAsync(item.Url);
                    return new WallpaperHtmlItem<HtmlDocument>
                    {
                        HtmlDocument = htmlDocument,
                        Type = item.Type
                    };
                });
                list_task.Add(task);
            });
            Task.WaitAll(list_task.ToArray());

            var wallpapers = new List<Wallpaper>();

            foreach (var list in list_task)
            {
                var item = await list;

                var imgs = item.HtmlDocument.DocumentNode.SelectNodes("//article[@id='wper']/div[@class='jbox']/div[@class='kbox']/div/a/img[1]").ToList();
                imgs.ForEach(x =>
                {
                    wallpapers.Add(new Wallpaper
                    {
                        Url = x.Attributes["data-big"].Value,
                        Title = x.Attributes["title"].Value,
                        Type = (int)item.Type,
                        CreateTime = x.Attributes["data-big"].Value.Split("/").Last().Split("_").First().TryToDateTime()
                    });
                });
            }

            var urls = _wallpaperRepository.GetListAsync().Result.Select(x => x.Url);
            wallpapers = wallpapers.Where(x => !urls.Contains(x.Url)).ToList();
            if (wallpapers.Any())
            {
                await _wallpaperRepository.BulkInsertAsync(wallpapers);
            }
        }
    }
}
using HtmlAgilityPack;
using Meowv.Blog.Domain.Hots;
using Meowv.Blog.Domain.Hots.Repositories;
using Meowv.Blog.Dto.Hots;
using Meowv.Blog.EventData.Hots;
using Meowv.Blog.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Quartz;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using Volo.Abp.BackgroundWorkers.Quartz;
using Volo.Abp.EventBus.Local;

namespace Meowv.Blog.Workers
{
    public class HotWorker : QuartzBackgroundWorkerBase
    {
        private readonly IHotRepository _hots;
        private readonly IHttpClientFactory _httpClient;
        private readonly ILocalEventBus _localEventBus;

        public HotWorker(IOptions<WorkerOptions> backgroundWorkerOptions,
                         IHotRepository hots,
                         IHttpClientFactory httpClient,
                         ILocalEventBus localEventBus)
        {
            _hots = hots;
            _httpClient = httpClient;
            _localEventBus = localEventBus;

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

            var tasks = new List<Task<HotItemDto<object>>>();
            var web = new HtmlWeb();

            foreach (var item in Hot.KnownSources.Dictionary)
            {
                var task = await Task.Factory.StartNew(async () =>
                {
                    var result = new object();
                    var source = item.Key;
                    var url = item.Value;

                    try
                    {
                        switch (source)
                        {
                            case Hot.KnownSources.juejin or Hot.KnownSources.csdn or Hot.KnownSources.zhihu or Hot.KnownSources.huxiu or Hot.KnownSources.douyin or Hot.KnownSources.woshipm or Hot.KnownSources.kaiyan:
                                {
                                    using var client = _httpClient.CreateClient();
                                    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66");

                                    switch (source)
                                    {
                                        case not Hot.KnownSources.juejin:
                                            result = await client.GetStringAsync(url);
                                            break;

                                        default:
                                            {
                                                var content = new ByteArrayContent("{\"id_type\":2,\"client_type\":2608,\"sort_type\":3,\"cursor\":\"0\",\"limit\":20}".GetBytes());
                                                content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

                                                var response = await client.PostAsync(url, content);
                                                result = await response.Content.ReadAsStringAsync();
                                                break;
                                            }
                                    }
                                    break;
                                }

                            default:
                                {
                                    var encoding = source is Hot.KnownSources.baidu or Hot.KnownSources.news163 or Hot.KnownSources.pojie52 ? Encoding.GetEncoding("GB2312") : Encoding.UTF8;
                                    result = await web.LoadFromWebAsync(url, encoding);
                                    break;
                                }
                        }
                    }
                    catch (Exception)
                    {
                        result = string.Empty;
                    }

                    return new HotItemDto<object>
                    {
                        Source = item.Key,
                        Result = result
                    };
                });
                tasks.Add(task);
            }
            Task.WaitAll(tasks.ToArray());

            var hots = new List<Hot>();

            Parallel.ForEach(tasks, new ParallelOptions { MaxDegreeOfParallelism = 10 }, async task =>
            {
                var item = await task;
                var source = item.Source;
                var result = item.Result;

                if (result.ToString().IsNullOrEmpty())
                {
                    Logger.LogError($"抓取失败：{source}...");
                    return;
                }

                var hot = new Hot() { Source = source };

                async Task SaveAsync()
                {
                    await _hots.DeleteAsync(x => x.Source == source, autoSave: true);
                    await _hots.InsertAsync(hot);
                    Logger.LogInformation($"成功抓取：{source}，{hot.Datas.Count} 条数据.");
                }

                switch (source)
                {
                    case Hot.KnownSources.cnblogs:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@id='post_list']/article/section/div/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", string.Empty)
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.segmentfault:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='news-list']/div/div/a[2]").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.SelectSingleNode(".//div/h4").InnerText,
                                    Url = $"https://segmentfault.com{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.weixin:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//ul[@class='news-list']/li/div[@class='txt-box']/h3/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.douban:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='channel-item']/div[@class='bd']/h3/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.ithome:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@id='rank']/ul[@id='d-1']/li//a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.oschina:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='ui items']/div/div[@class='content']/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.kr36:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='list-wrapper']/div[@class='list-section-wrapper']/div[@class='article-list']/div/div/div/div/div/p/a").ToList();

                            nodes.ForEach(x =>
                            {
                                var url = $"https://36kr.com{x.GetAttributeValue("href", "")}";
                                if (!hot.Datas.Any(d => d.Url == url))
                                {
                                    hot.Datas.Add(new Data
                                    {
                                        Title = x.InnerText,
                                        Url = url
                                    });
                                }
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.baidu:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//table[@class='list-table']//tr/td[@class='keyword']/a[@class='list-title']").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.tieba:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//ul[@class='topic-top-list']/li//a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "").Replace("amp;", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.weibo:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//table/tbody/tr/td[2]/a").ToList();

                            nodes.ForEach(x =>
                            {
                                var url = x.GetAttributeValue("href", "");
                                if (url == "javascript:void(0);") url = x.GetAttributeValue("href_to", "");

                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://s.weibo.com{url}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.juejin:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["data"];

                            foreach (var node in nodes)
                            {
                                if ((int)node["item_type"] == 14) continue;

                                hot.Datas.Add(new Data
                                {
                                    Title = node["item_info"]["article_info"]["title"].ToString(),
                                    Url = $"https://juejin.cn/post/{node["item_info"]["article_id"]}"
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.csdn:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["data"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["articleTitle"].ToString(),
                                    Url = node["articleDetailUrl"].ToString()
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.toutiao:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='posts']/div[@class='post']/div[@class='content']/h3/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://toutiao.io{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.imooc:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='articleCon js-usercard-box']/div/div/a[@class='title']").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://www.imooc.com{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.zhihu:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["data"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["target"]["title"].ToString(),
                                    Url = $"https://www.zhihu.com/question/{node["target"]["id"]}"
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.zhihudaily:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='box']/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://daily.zhihu.com{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.news163:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='area-half left']/div[@class='tabBox']/div[@class='tabContents active']/table//tr/td[1]/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", "")
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.sspai:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='article']/div[@class='articleCard']/div/div/div/div[@class='card_content']/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://sspai.com{x.GetAttributeValue("href", "")}",
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.woshipm:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["payload"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["title"].ToString(),
                                    Url = node["permalink"].ToString()
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.huxiu:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["data"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["title"].ToString(),
                                    Url = $"https://www.huxiu.com/article/{node["aid"]}.html",
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.jandan:
                        {
                            var html = result as HtmlDocument;
                            var content = HttpUtility.UrlDecode(html.DocumentNode.SelectSingleNode("//div[@id='list-hotposts']").InnerHtml);
                            content = content.Replace("<script>", "")
                                             .Replace("</script>", "")
                                             .Replace("document.write(decodeURIComponent('", "")
                                             .Replace("'));", "");
                            html.LoadHtml(content);

                            var nodes = html.DocumentNode.SelectNodes("//li/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = x.GetAttributeValue("href", ""),
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.pojie52:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@class='tl']/table/tr/th/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https://www.52pojie.cn/{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.tianya:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//div[@id='main']/div[@class='mt5']/table/tbody/tr/td[1]/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"http://bbs.tianya.cn/{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.bilibili:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//ul[@class='rank-list']/li/div/div[@class='info']/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText,
                                    Url = $"https{x.GetAttributeValue("href", "")}"
                                });
                            });

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.douyin:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["aweme_list"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["aweme_info"]["desc"].ToString(),
                                    Url = node["aweme_info"]["share_url"].ToString()
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.kaiyan:
                        {
                            var json = result as string;
                            var nodes = JObject.Parse(json)["dailyList"].FirstOrDefault()["videoList"];

                            foreach (var node in nodes)
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = node["title"].ToString(),
                                    Url = $"https://www.kaiyanapp.com/detail.html?vid={node["id"]}"
                                });
                            }

                            await SaveAsync();
                            break;
                        }

                    case Hot.KnownSources.github:
                        {
                            var html = result as HtmlDocument;
                            var nodes = html.DocumentNode.SelectNodes("//article[@class='Box-row']/h1/a").ToList();

                            nodes.ForEach(x =>
                            {
                                hot.Datas.Add(new Data
                                {
                                    Title = x.InnerText.Replace("\n", "").Replace(" ", ""),
                                    Url = $"https://github.com{x.GetAttributeValue("href", "")}",
                                });
                            });

                            await SaveAsync();
                            break;
                        }
                }
            });

            await _localEventBus.PublishAsync(new HotWorkerEventData());

            await Task.CompletedTask;
        }
    }
}
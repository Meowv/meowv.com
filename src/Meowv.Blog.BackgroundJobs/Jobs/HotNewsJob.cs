using HtmlAgilityPack;
using Meowv.Blog.Application.Contracts.HotNews;
using Meowv.Blog.Domain.Shared.Enum;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.BackgroundJobs.Jobs
{
    public class HotNewsJob : ITransientDependency
    {
        /// <summary>
        /// 每日热点数据抓取
        /// </summary>
        /// <returns></returns>
        public async Task RunAsync()
        {
            var hotnewsUrls = new List<HotNewsJobItem<string>>
            {
                new HotNewsJobItem<string> { Result = "https://www.cnblogs.com", Source = HotNewsEnum.cnblogs },
                new HotNewsJobItem<string> { Result = "https://www.v2ex.com/?tab=hot", Source = HotNewsEnum.v2ex },
                new HotNewsJobItem<string> { Result = "https://segmentfault.com/hottest", Source = HotNewsEnum.segmentfault },
                new HotNewsJobItem<string> { Result = "https://web-api.juejin.im/query", Source = HotNewsEnum.juejin },
                new HotNewsJobItem<string> { Result = "https://weixin.sogou.com", Source = HotNewsEnum.weixin },
                new HotNewsJobItem<string> { Result = "https://www.douban.com/group/explore", Source = HotNewsEnum.douban },
                new HotNewsJobItem<string> { Result = "https://www.ithome.com", Source = HotNewsEnum.ithome },
                new HotNewsJobItem<string> { Result = "https://36kr.com/newsflashes", Source = HotNewsEnum.kr36 },
                new HotNewsJobItem<string> { Result = "http://tieba.baidu.com/hottopic/browse/topicList", Source = HotNewsEnum.tieba },
                new HotNewsJobItem<string> { Result = "http://top.baidu.com/buzz?b=341", Source = HotNewsEnum.baidu },
                new HotNewsJobItem<string> { Result = "https://s.weibo.com/top/summary/summary", Source = HotNewsEnum.weibo },
                new HotNewsJobItem<string> { Result = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true", Source = HotNewsEnum.zhihu },
                new HotNewsJobItem<string> { Result = "https://daily.zhihu.com", Source = HotNewsEnum.zhihudaily },
                new HotNewsJobItem<string> { Result = "http://news.163.com/special/0001386F/rank_whole.html", Source = HotNewsEnum.news163 },
                new HotNewsJobItem<string> { Result = "https://github.com/trending", Source = HotNewsEnum.github },
                new HotNewsJobItem<string> { Result = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word", Source = HotNewsEnum.douyin_hot },
                new HotNewsJobItem<string> { Result = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme", Source = HotNewsEnum.douyin_video },
                new HotNewsJobItem<string> { Result = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme/?type=positive", Source = HotNewsEnum.douyin_positive },
            };

            var web = new HtmlWeb();
            var list_task = new List<Task<HotNewsJobItem<HtmlDocument>>>();

            Console.WriteLine("1");
        }
    }
}
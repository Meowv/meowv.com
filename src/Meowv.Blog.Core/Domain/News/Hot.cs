using System;
using System.Collections.Generic;

namespace Meowv.Blog.Domain.News
{
    public class Hot : EntityBase
    {
        /// <summary>
        /// <see cref="KnownSources"/>
        /// </summary>
        public string Source { get; set; }

        public List<Data> Datas { get; set; } = new List<Data>();

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public static class KnownSources
        {
            public const string cnblogs = "博客园";

            public const string v2ex = "V2EX";

            public const string segmentfault = "思否";

            public const string weixin = "微信热门";

            public const string douban = "豆瓣精选";

            public const string ithome = "IT之家";

            public const string kr36 = "36氪";

            public const string baidu = "百度热搜";

            public const string tieba = "百度贴吧";

            public const string weibo = "微博热搜";

            public const string zhihu = "知乎热榜";

            public const string zhihudaily = "知乎日报";

            public const string news163 = "网易新闻";

            public static Dictionary<string, string> Dictionary { get; set; } = new Dictionary<string, string>
            {
                { cnblogs, "https://www.cnblogs.com" },
                { v2ex, "https://www.v2ex.com/?tab=hot" },
                { segmentfault, "https://segmentfault.com/hottest" },
                { weixin, "https://weixin.sogou.com" },
                { douban, "https://www.douban.com/group/explore" },
                { ithome, "https://www.ithome.com" },
                { kr36, "https://36kr.com/hot-list/catalog" },
                { baidu, "http://top.baidu.com/buzz?b=341" },
                { tieba, "http://tieba.baidu.com/hottopic/browse/topicList?res_type=1" },
                { weibo, "https://s.weibo.com/top/summary/summary" },
                { zhihu, "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50" },
                { zhihudaily, "https://daily.zhihu.com" },
                { news163, "http://news.163.com/special/0001386F/rank_whole.html" }
            };
        }
    }

    public class Data
    {
        public string Title { get; set; }

        public string Url { get; set; }
    }
}
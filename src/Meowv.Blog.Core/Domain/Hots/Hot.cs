using Meowv.Blog.Dto.Hots;
using System;
using System.Collections.Generic;

namespace Meowv.Blog.Domain.Hots
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

            public const string segmentfault = "思否";

            public const string weixin = "微信热门";

            public const string douban = "豆瓣精选";

            public const string ithome = "IT之家";

            public const string oschina = "开源中国";

            public const string kr36 = "36氪";

            public const string baidu = "百度热搜";

            public const string tieba = "百度贴吧";

            public const string weibo = "微博热搜";

            public const string juejin = "掘金";

            public const string csdn = "CSDN";

            public const string toutiao = "开发者头条";

            public const string imooc = "慕星手记";

            public const string zhihu = "知乎热榜";

            public const string zhihudaily = "知乎日报";

            public const string news163 = "网易新闻";

            public const string sspai = "少数派";

            public const string woshipm = "人人都是产品经理";

            public const string huxiu = "虎嗅网";

            public const string jandan = "煎蛋";

            public const string pojie52 = "吾爱破解";

            public const string tianya = "天涯";

            public const string bilibili = "哔哩哔哩";

            public const string douyin = "抖音";

            public const string kaiyan = "开眼视频";

            public const string github = "GitHub";

            public static Dictionary<string, string> Dictionary { get; set; } = new Dictionary<string, string>
            {
                { cnblogs, "https://www.cnblogs.com" },
                { segmentfault, "https://segmentfault.com/hottest" },
                { weixin, "https://weixin.sogou.com" },
                { douban, "https://www.douban.com/group/explore" },
                { ithome, "https://www.ithome.com" },
                { oschina, "https://www.oschina.net/news" },
                { kr36, "https://36kr.com/hot-list/catalog" },
                { baidu, "http://top.baidu.com/buzz?b=341" },
                { tieba, "http://tieba.baidu.com/hottopic/browse/topicList?res_type=1" },
                { weibo, "https://s.weibo.com/top/summary/summary" },
                { juejin, "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed" },
                { csdn, "https://blog.csdn.net/phoenix/web/blog/hotRank?pageSize=50" },
                { toutiao, "https://toutiao.io" },
                { imooc, "https://www.imooc.com/article/excellent?type=3" },
                { zhihu, "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50" },
                { zhihudaily, "https://daily.zhihu.com" },
                { news163, "http://news.163.com/special/0001386F/rank_whole.html" },
                { sspai, "https://sspai.com/tag/%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0" },
                { woshipm, "http://www.woshipm.com/__api/v1/browser/popular" },
                { huxiu, "https://article-api.huxiu.com/web/index/articleList?platform=www" },
                { jandan, "http://jandan.net/top" },
                { pojie52, "https://www.52pojie.cn/misc.php?mod=ranklist&type=thread&view=heats&orderby=today" },
                { tianya, "http://bbs.tianya.cn/list.jsp?item=free&grade=3&order=1" },
                { bilibili, "https://www.bilibili.com/v/popular/rank/all" },
                { douyin, "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme" },
                { kaiyan, "https://baobab.kaiyanapp.com/api/v1/feed?udid=3e7ee30c6fc0004a773dc33b0597b5732b145c04" },
                { github, "https://github.com/trending/c%23?since=daily" }
            };
        }
    }
}
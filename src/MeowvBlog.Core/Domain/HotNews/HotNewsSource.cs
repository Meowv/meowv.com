using Plus.CodeAnnotations;

namespace MeowvBlog.Core.Domain.HotNews
{
    public enum HotNewsSource
    {
        [EnumAlias("博客园")]
        cnblogs = 1,

        [EnumAlias("V2EX")]
        v2ex = 2,

        [EnumAlias("SegmentFault")]
        segmentfault = 3,

        [EnumAlias("掘金")]
        juejin = 4,

        [EnumAlias("微信热门")]
        weixin = 5,

        [EnumAlias("豆瓣精选")]
        douban = 6,

        [EnumAlias("IT之家")]
        ithome = 7,

        [EnumAlias("36氪")]
        kr36 = 8,

        [EnumAlias("百度贴吧")]
        tieba = 9,

        [EnumAlias("百度热搜")]
        baidu = 10,

        [EnumAlias("微博热搜")]
        weibo = 11,

        [EnumAlias("知乎热榜")]
        zhihu = 12,

        [EnumAlias("知乎日报")]
        zhihudaily = 13,

        [EnumAlias("网易新闻")]
        news163 = 14,

        [EnumAlias("GitHub")]
        github = 15
    }
}
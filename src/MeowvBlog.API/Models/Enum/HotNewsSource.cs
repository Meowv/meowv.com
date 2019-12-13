using System.ComponentModel;

namespace MeowvBlog.API.Models.Enum
{
    /// <summary>
    /// HotNewsSource
    /// </summary>
    public enum HotNewsSource
    {
        [Description("博客园")]
        cnblogs = 1,

        [Description("V2EX")]
        v2ex = 2,

        [Description("SegmentFault")]
        segmentfault = 3,

        [Description("掘金")]
        juejin = 4,

        [Description("微信热门")]
        weixin = 5,

        [Description("豆瓣精选")]
        douban = 6,

        [Description("IT之家")]
        ithome = 7,

        [Description("36氪")]
        kr36 = 8,

        [Description("百度贴吧")]
        tieba = 9,

        [Description("百度热搜")]
        baidu = 10,

        [Description("微博热搜")]
        weibo = 11,

        [Description("知乎热榜")]
        zhihu = 12,

        [Description("知乎日报")]
        zhihudaily = 13,

        [Description("网易新闻")]
        news163 = 14,

        [Description("GitHub")]
        github = 15,

        [Description("抖音热点")]
        douyin_hot = 16,

        [Description("抖音视频")]
        douyin_video = 17,

        [Description("抖音正能量")]
        douyin_positive = 18
    }
}
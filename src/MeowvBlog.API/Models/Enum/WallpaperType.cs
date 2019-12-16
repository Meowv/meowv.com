using System.ComponentModel;

namespace MeowvBlog.API.Models.Enum
{
    public enum WallpaperType
    {
        [Description("推荐")]
        Recommend = 1,

        [Description("最新")]
        Latest = 2,

        [Description("周排行")]
        WeeklyRanking = 3,

        [Description("月排行")]
        MonthlyRanking = 4,

        [Description("总排行")]
        TotalRanking = 5,

        [Description("美女")]
        Beauty = 6,

        [Description("型男")]
        Sportsman = 7,

        [Description("萌娃")]
        CuteBaby = 8,

        [Description("情感")]
        Emotion = 9,

        [Description("风景")]
        Landscape = 10,

        [Description("动物")]
        Animal = 11,

        [Description("植物")]
        Plant = 12,

        [Description("美食")]
        Food = 13,

        [Description("影视")]
        Movie = 14,

        [Description("动漫")]
        Anime = 15,

        [Description("手绘")]
        HandPainted = 16,

        [Description("文字")]
        Text = 17,

        [Description("创意")]
        Creative = 18,

        [Description("名车")]
        Car = 19,

        [Description("体育")]
        PhysicalEducation = 20,

        [Description("军事")]
        Military = 21,

        [Description("节日")]
        Festival = 22,

        [Description("游戏")]
        Game = 23,

        [Description("苹果")]
        Apple = 24,

        [Description("其它")]
        Other = 25,
    }
}
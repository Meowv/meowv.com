namespace Meowv.Blog.Domain.Shared
{
    public class MeowvBlogDbConsts
    {
        public static class DbTableName
        {
            /// <summary>
            /// 文章表
            /// </summary>
            public const string Posts = "Posts";

            /// <summary>
            /// 分类表
            /// </summary>
            public const string Categories = "Categories";

            /// <summary>
            /// 标签表
            /// </summary>
            public const string Tags = "Tags";

            /// <summary>
            /// 文章标签一对多
            /// </summary>
            public const string PostTags = "Post_Tags";

            /// <summary>
            /// 友情链接
            /// </summary>
            public const string Friendlinks = "Friendlinks";

            /// <summary>
            /// 手机壁纸
            /// </summary>
            public const string Wallpapers = "Wallpapers";

            /// <summary>
            /// 每日热点
            /// </summary>
            public const string HotNews = "HotNews";

            /// <summary>
            /// 个性签名
            /// </summary>
            public const string Signatures = "Signatures";

            /// <summary>
            /// 鸡汤
            /// </summary>
            public const string ChickenSoups = "ChickenSoups";

            /// <summary>
            /// 图集表
            /// </summary>
            public const string Albums = "Albums";

            /// <summary>
            /// 图片表
            /// </summary>
            public const string Images = "Images";
        }
    }
}
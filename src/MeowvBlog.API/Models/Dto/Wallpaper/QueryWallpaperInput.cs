namespace MeowvBlog.API.Models.Dto.Wallpaper
{
    public class QueryWallpaperInput : PagingInput
    {
        /// <summary>
        /// 类型
        /// </summary>
        public int Type { get; set; }

        /// <summary>
        /// 限制条数
        /// </summary>
        public new int Limit { get; set; } = 30;

        /// <summary>
        /// 搜索关键字
        /// </summary>
        public string Keywords { get; set; }
    }
}
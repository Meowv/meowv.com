using MeowvBlog.API.Models.Enum;

namespace MeowvBlog.API.Models.Dto.Wallpaper
{
    public class QueryWallpaperInput : PagingInput
    {
        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperType Type { get; set; }

        /// <summary>
        /// 限制条数
        /// </summary>
        public new int Limit { get; set; } = 30;
    }
}
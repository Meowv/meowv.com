using Meowv.Blog.Domain.Shared.Enum;

namespace Meowv.Blog.Application.Contracts.Wallpaper.Params
{
    public class QueryWallpapersInput : PagingInput
    {
        /// <summary>
        /// 类型
        /// <see cref="WallpaperEnum"/>
        /// </summary>
        public int Type { get; set; }

        /// <summary>
        /// 关键字
        /// </summary>
        public string Keywords { get; set; }
    }
}
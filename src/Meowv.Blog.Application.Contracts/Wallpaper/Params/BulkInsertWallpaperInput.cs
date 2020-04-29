using Meowv.Blog.Domain.Shared.Enum;
using System.Collections.Generic;

namespace Meowv.Blog.Application.Contracts.Wallpaper.Params
{
    public class BulkInsertWallpaperInput
    {
        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperEnum Type { get; set; }

        /// <summary>
        /// 壁纸列表
        /// </summary>
        public IEnumerable<WallpaperDto> Wallpapers { get; set; }
    }
}
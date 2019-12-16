using MeowvBlog.API.Models.Enum;
using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Wallpaper
{
    public class InsertWallpaperInput
    {
        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperType Type { get; set; }

        /// <summary>
        /// 壁纸列表
        /// </summary>
        public IList<WallpaperDto> Wallpapers { get; set; }
    }
}
using Meowv.Blog.Domain.Shared.Enum;

namespace Meowv.Blog.Application.Contracts.Wallpaper.Jobs
{
    public class WallpaperUrls
    {
        /// <summary>
        /// Url
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperEnum Type { get; set; }
    }
}
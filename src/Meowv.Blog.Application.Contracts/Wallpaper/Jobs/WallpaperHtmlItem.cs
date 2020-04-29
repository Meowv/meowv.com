using Meowv.Blog.Domain.Shared.Enum;

namespace Meowv.Blog.Application.Contracts.Wallpaper.Jobs
{
    public class WallpaperHtmlItem<T>
    {
        /// <summary>
        /// HtmlDocument
        /// </summary>
        public T HtmlDocument { get; set; }

        /// <summary>
        /// 类型
        /// </summary>
        public WallpaperEnum Type { get; set; }
    }
}
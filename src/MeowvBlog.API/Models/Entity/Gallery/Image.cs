using System;

namespace MeowvBlog.API.Models.Entity.Gallery
{
    /// <summary>
    /// Image
    /// </summary>
    public class Image
    {
        /// <summary>
        /// 主键
        /// </summary>
        public string Id { get; set; }

        /// <summary>
        /// AlbumId
        /// </summary>
        public string AlbumId { get; set; }

        /// <summary>
        /// 图片URL
        /// </summary>
        public string ImgUrl { get; set; }

        /// <summary>
        /// 宽
        /// </summary>
        public int Width { get; set; }

        /// <summary>
        /// 高
        /// </summary>
        public int Height { get; set; }

        /// <summary>
        /// 日期
        /// </summary>
        public DateTime Date { get; set; }
    }
}
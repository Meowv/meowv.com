using System;
using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Domain.Gallery
{
    public class Image : Entity<Guid>
    {
        /// <summary>
        /// AlbumId
        /// </summary>
        public Guid AlbumId { get; set; }

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
        /// 创建时间
        /// </summary>
        public DateTime CreateTime { get; set; }
    }
}
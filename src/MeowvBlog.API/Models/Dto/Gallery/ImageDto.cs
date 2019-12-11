using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class ImageDto
    {
        /// <summary>
        /// AlbumId
        /// </summary>
        public string AlbumId { get; set; }

        /// <summary>
        /// 图片列表
        /// </summary>
        public IList<Entity> Imgs { get; set; }
    }

    public class Entity
    {
        /// <summary>
        /// URL
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// 宽
        /// </summary>
        public int Width { get; set; }

        /// <summary>
        /// 高
        /// </summary>
        public int Height { get; set; }
    }
}
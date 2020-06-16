using System;

namespace Meowv.Blog.Application.Contracts.Gallery
{
    public class AlbumDto
    {
        /// <summary>
        /// Id
        /// </summary>
        public Guid Id { get; set; }

        /// <summary>
        /// 总数
        /// </summary>
        public int Count { get; set; }

        /// <summary>
        /// 名称
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 图片URL
        /// </summary>
        public string ImgUrl { get; set; }

        /// <summary>
        /// 是否公开
        /// </summary>
        public bool IsPublic { get; set; }
    }
}
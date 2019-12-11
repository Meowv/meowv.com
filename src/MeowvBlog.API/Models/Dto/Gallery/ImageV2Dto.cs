using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class ImageV2Dto
    {
        /// <summary>
        /// AlbumId
        /// </summary>
        public string AlbumId { get; set; }

        /// <summary>
        /// 图片URL列表
        /// </summary>
        public IList<string> ImgUrls { get; set; }
    }
}
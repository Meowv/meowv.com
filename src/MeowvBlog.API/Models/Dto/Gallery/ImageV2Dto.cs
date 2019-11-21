using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class ImageV2Dto
    {
        public string AlbumId { get; set; }

        public IList<string> ImgUrls { get; set; }
    }
}
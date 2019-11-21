using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class ImageDto
    {
        public string AlbumId { get; set; }

        public IList<Entity> Imgs { get; set; }
    }

    public class Entity
    {
        public string Url { get; set; }

        public int Width { get; set; }

        public int Height { get; set; }
    }
}
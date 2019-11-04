using System;

namespace MeowvBlog.Core.Domain.Gallery
{
    public class Image
    {
        public string Id { get; set; }

        public string AlbumId { get; set; }

        public string ImgUrl { get; set; }

        public int Width { get; set; }

        public int Height { get; set; }

        public DateTime Date { get; set; }
    }
}
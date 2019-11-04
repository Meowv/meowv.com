using System;

namespace MeowvBlog.Core.Domain.Gallery
{
    public class Image
    {
        public string Id { get; set; }

        public string AlbumId { get; set; }

        public string ImgUrl { get; set; }

        public DateTime Date { get; set; }
    }
}
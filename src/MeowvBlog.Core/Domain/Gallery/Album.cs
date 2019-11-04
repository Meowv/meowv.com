using System;

namespace MeowvBlog.Core.Domain.Gallery
{
    public class Album
    {
        public string Id { get; set; }

        public string Name { get; set; }

        public string ImgUrl { get; set; }

        public DateTime Date { get; set; }
    }
}
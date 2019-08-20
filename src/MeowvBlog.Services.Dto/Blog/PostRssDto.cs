using System;

namespace MeowvBlog.Services.Dto.Blog
{
    public class PostRssDto
    {
        public string Title { get; set; }

        public string Link { get; set; }

        public string Description { get; set; }

        public string Author { get; set; }

        public string Category { get; set; }

        public DateTime? PubDate { get; set; }
    }
}
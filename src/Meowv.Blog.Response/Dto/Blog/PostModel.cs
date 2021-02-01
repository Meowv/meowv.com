using System;
using System.Collections.Generic;

namespace Meowv.Blog.Dto.Blog
{
    public class PostModel
    {
        public string Title { get; set; }

        public string Author { get; set; }

        public string Url { get; set; }

        public string Markdown { get; set; }

        public string Category { get; set; }

        public List<string> Tag { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
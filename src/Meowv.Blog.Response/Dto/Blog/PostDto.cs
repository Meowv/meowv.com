using System.Collections.Generic;

namespace Meowv.Blog.Dto.Blog
{
    public class PostDto
    {
        public string Title { get; set; }

        public string Author { get; set; }

        public string Url { get; set; }

        public string Markdown { get; set; }

        public CategoryAdminDto Category { get; set; }

        public List<TagAdminDto> Tags { get; set; }

        public string CreatedAt { get; set; }
    }
}
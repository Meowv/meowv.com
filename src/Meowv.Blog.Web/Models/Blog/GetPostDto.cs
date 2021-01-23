using System.Collections.Generic;

namespace Meowv.Blog.Dto.Blog
{
    public class GetPostDto
    {
        public int Year { get; set; }

        public IEnumerable<PostBriefDto> Posts { get; set; }
    }
}
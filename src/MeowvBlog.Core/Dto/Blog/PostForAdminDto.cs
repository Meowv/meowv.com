using System.Collections.Generic;

namespace MeowvBlog.Core.Dto.Blog
{
    public class PostForAdminDto : PostDto
    {
        public IList<string> Tags { get; set; }
    }
}
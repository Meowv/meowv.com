using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.Blog
{
    public class PostForAdminDto : PostDto
    {
        public IList<string> Tags { get; set; }
    }
}
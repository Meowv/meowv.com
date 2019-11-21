using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Blog
{
    public class PostForAdminDto : PostDto
    {
        public IList<string> Tags { get; set; }
    }
}
using System.Collections.Generic;

namespace Meowv.Blog.Dto.Blog
{
    public class GetAdminPostDto : GetPostDto
    {
        /// <summary>
        /// Posts
        /// </summary>
        public new IEnumerable<PostBriefAdminDto> Posts { get; set; }
    }
}
using System.Collections.Generic;

namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryPostForAdminDto : QueryPostDto
    {
        /// <summary>
        /// Posts
        /// </summary>
        public new IEnumerable<PostBriefForAdminDto> Posts { get; set; }
    }
}
using System.Collections.Generic;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryPostForAdminDto : QueryPostDto
    {
        public new IList<PostBriefForAdminDto> Posts { get; set; }
    }
}
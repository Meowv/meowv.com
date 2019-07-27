using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.Blog
{
    public class QueryPostForAdminDto : QueryPostDto
    {
        public new IList<PostBriefForAdminDto> Posts { get; set; }
    }
}
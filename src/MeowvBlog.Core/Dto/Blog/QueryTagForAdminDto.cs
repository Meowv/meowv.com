using MeowvBlog.Core.Domain.Blog;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryTagForAdminDto : Tag
    {
        public int Count { get; set; }
    }
}
using MeowvBlog.Core.Domain.Blog;

namespace MeowvBlog.Services.Dto.Blog
{
    public class QueryTagForAdminDto : Tag
    {
        public int Count { get; set; }
    }
}
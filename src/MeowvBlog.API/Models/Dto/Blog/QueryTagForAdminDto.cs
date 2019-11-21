using MeowvBlog.API.Models.Entity.Blog;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryTagForAdminDto : Tag
    {
        public int Count { get; set; }
    }
}
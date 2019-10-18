using MeowvBlog.Core.Domain.Blog;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryCategoryForAdminDto : Category
    {
        public int Count { get; set; }
    }
}
using MeowvBlog.Core.Domain.Blog;

namespace MeowvBlog.Services.Dto.Blog
{
    public class QueryCategoryForAdminDto : Category
    {
        public int Count { get; set; }
    }
}
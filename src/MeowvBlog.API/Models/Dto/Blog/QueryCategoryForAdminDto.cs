using MeowvBlog.API.Models.Entity.Blog;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryCategoryForAdminDto : Category
    {
        public int Count { get; set; }
    }
}
using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(Category))]
    public class QueryCategoryDto : CategoryDto
    {
        public int Count { get; set; }
    }
}
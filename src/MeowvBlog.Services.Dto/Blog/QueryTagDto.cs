using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(Tag))]
    public class QueryTagDto : TagDto
    {
        public int Count { get; set; }
    }
}
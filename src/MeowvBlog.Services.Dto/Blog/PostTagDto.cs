using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(PostTag))]
    public class PostTagDto
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int PostId { get; set; }

        /// <summary>
        /// 标签Id
        /// </summary>
        public int TagId { get; set; }
    }
}
using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    /// <summary>
    /// 获取文章传输对象
    /// </summary>
    [AutoMapFrom(typeof(Post))]
    public class GetPostDto : PostDto
    {
        /// <summary>
        /// 创建时间
        /// </summary>
        public new string CreationTime { get; set; }
    }
}
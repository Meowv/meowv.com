using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(Tag))]
    public class TagDto
    {
        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }
    }
}
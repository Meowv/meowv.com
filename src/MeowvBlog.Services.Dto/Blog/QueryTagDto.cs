using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(Tag))]
    public class QueryTagDto
    {
        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }

        /// <summary>
        /// 标签个数
        /// </summary>
        public int Count { get; set; }
    }
}
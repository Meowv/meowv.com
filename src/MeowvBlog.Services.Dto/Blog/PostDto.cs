using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;
using System;

namespace MeowvBlog.Services.Dto.Blog
{
    /// <summary>
    /// 文章增删改传输对象
    /// </summary>
    [AutoMapFrom(typeof(Post))]
    public class PostDto
    {
        /// <summary>
        /// 标题
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// 作者
        /// </summary>
        public string Author { get; set; }

        /// <summary>
        /// 链接
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// 内容
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// 创建时间
        /// </summary>
        public DateTime? CreationTime { get; set; }
    }
}
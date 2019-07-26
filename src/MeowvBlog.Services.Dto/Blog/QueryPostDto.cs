using MeowvBlog.Core.Domain.Blog;
using Plus.AutoMapper;
using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.Blog
{
    [AutoMapFrom(typeof(Post))]
    public class QueryPostDto
    {
        /// <summary>
        /// 年份
        /// </summary>
        public int Year { get; set; }

        /// <summary>
        /// Posts
        /// </summary>
        public IList<PostBriefDto> Posts { get; set; }
    }
}
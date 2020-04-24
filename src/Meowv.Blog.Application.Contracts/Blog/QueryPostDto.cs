using System.Collections.Generic;

namespace Meowv.Blog.Application.Contracts.Blog
{
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
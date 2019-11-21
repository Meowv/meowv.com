using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Blog
{
    public class GetPostDto
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
        /// HTML
        /// </summary>
        public string Html { get; set; }

        /// <summary>
        /// Markdown
        /// </summary>
        public string Markdown { get; set; }

        /// <summary>
        /// 创建时间
        /// </summary>
        public string CreationTime { get; set; }

        /// <summary>
        /// 分类
        /// </summary>
        public CategoryDto Category { get; set; }

        /// <summary>
        /// 标签列表
        /// </summary>
        public IList<TagDto> Tags { get; set; }

        /// <summary>
        /// 上一篇
        /// </summary>
        public PostForPagedDto Previous { get; set; }

        /// <summary>
        /// 下一篇
        /// </summary>
        public PostForPagedDto Next { get; set; }
    }
}
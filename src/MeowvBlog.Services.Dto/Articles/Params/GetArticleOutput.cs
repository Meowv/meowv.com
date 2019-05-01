using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Tags;
using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 获取一篇文章详细信息输出参数
    /// </summary>
    public class GetArticleOutput
    {
        /// <summary>
        /// 文章
        /// </summary>
        public ArticleDto Article { get; set; }

        /// <summary>
        /// 分类
        /// </summary>
        public CategoryDto Category { get; set; }

        /// <summary>
        /// 标签
        /// </summary>
        public IList<TagDto> Tags { get; set; }

        /// <summary>
        /// 上一篇
        /// </summary>
        public ArticleForPagedDto Previous { get; set; }

        /// <summary>
        /// 下一篇
        /// </summary>
        public ArticleForPagedDto Next { get; set; }
    }
}
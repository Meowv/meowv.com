using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Tags;
using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 文章列表输出参数
    /// </summary>
    public class GetArticleListOutput
    {
        /// <summary>
        /// 文章
        /// </summary>
        public ArticleBriefDto Article { get; set; }

        /// <summary>
        /// 分类
        /// </summary>
        public CategoryDto Category { get; set; }

        /// <summary>
        /// 标签
        /// </summary>
        public IList<TagDto> Tags { get; set; }
    }
}
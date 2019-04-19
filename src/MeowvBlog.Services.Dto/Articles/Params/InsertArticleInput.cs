using System;

namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 新增文章输入参数
    /// </summary>
    public class InsertArticleInput
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
        /// 来源
        /// </summary>
        public string Source { get; set; }

        /// <summary>
        /// 链接
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// 简介
        /// </summary>
        public string Summary { get; set; }

        /// <summary>
        /// 内容
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// 关键字
        /// </summary>
        public string MetaKeywords { get; set; }

        /// <summary>
        /// 描述
        /// </summary>
        public string MetaDescription { get; set; }

        /// <summary>
        /// 发布时间
        /// </summary>
        public DateTime PostTime { get; set; }
    }
}
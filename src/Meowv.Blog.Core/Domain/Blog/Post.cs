using System;
using System.Collections.Generic;

namespace Meowv.Blog.Domain.Blog
{
    public class Post : EntityBase
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
        /// Markdown
        /// </summary>
        public string Markdown { get; set; }

        /// <summary>
        /// 分类
        /// </summary>
        public Category Category { get; set; }

        /// <summary>
        /// 标签列表
        /// </summary>
        public List<Tag> Tags { get; set; }

        /// <summary>
        /// 创建时间
        /// </summary>
        public DateTime CreatedAt { get; set; }
    }
}
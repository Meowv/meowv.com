using MeowvBlog.Core.Domain.Articles;
using Newtonsoft.Json;
using System;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.Dto.Articles
{
    /// <summary>
    /// 文章传输对象
    /// </summary>
    [AutoMapFrom(typeof(Article))]
    public class ArticleDto
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
        /// 内容
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// 点击量
        /// </summary>
        public int Hits { get; set; }

        /// <summary>
        /// 发布时间
        /// </summary>
        [JsonConverter(typeof(DateTimeConverter))]
        public DateTime PostTime { get; set; }
    }
}
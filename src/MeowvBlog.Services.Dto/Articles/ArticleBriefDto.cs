using MeowvBlog.Core.Domain.Articles;
using Newtonsoft.Json;
using System;
using UPrime.AutoMapper;
using UPrime.Services.Dto;

namespace MeowvBlog.Services.Dto.Articles
{
    /// <summary>
    /// 文章简短传输对象，用于文章列表
    /// </summary>
    [AutoMapFrom(typeof(Article))]
    public class ArticleBriefDto : EntityDto
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
        /// 发布时间
        /// </summary>
        [JsonConverter(typeof(DateTimeConverter))]
        public DateTime PostTime { get; set; }
    }
}
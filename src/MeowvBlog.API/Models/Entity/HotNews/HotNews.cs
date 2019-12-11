using System;

namespace MeowvBlog.API.Models.Entity.HotNews
{
    /// <summary>
    /// HotNews
    /// </summary>
    public class HotNews
    {
        /// <summary>
        /// 主键
        /// </summary>
        public string Id { get; set; }

        /// <summary>
        /// 标题
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// 链接
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// SourceId
        /// </summary>
        public int SourceId { get; set; }

        /// <summary>
        /// 日期
        /// </summary>
        public DateTime Date { get; set; }
    }
}
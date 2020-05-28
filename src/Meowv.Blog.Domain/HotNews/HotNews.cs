using System;
using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Domain.HotNews
{
    public class HotNews : Entity<Guid>
    {
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
        /// 创建时间
        /// </summary>
        public DateTime CreateTime { get; set; }
    }
}
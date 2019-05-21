using Plus.Domain.Entities;
using System.Collections.Generic;

namespace MeowvBlog.Core.Domain
{
    public class Tag : Entity
    {
        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }

        /// <summary>
        /// PostTags
        /// </summary>
        public virtual ICollection<PostTag> PostTags { get; set; }
    }
}
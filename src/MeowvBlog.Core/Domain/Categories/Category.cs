using System;
using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Categories
{
    /// <summary>
    /// 分类实体
    /// </summary>
    public class Category : Entity, IHasCreationTime
    {
        /// <summary>
        /// 分类名称
        /// </summary>
        public string CategoryName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }

        /// <summary>
        /// 创建时间
        /// </summary>
        public DateTime CreationTime { get; set; }
    }
}
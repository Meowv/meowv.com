using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Categories
{
    /// <summary>
    /// 分类实体
    /// </summary>
    public class Category : FullAuditedEntity, IEntity<int>
    {
        /// <summary>
        /// 分类名称
        /// </summary>
        public string CategoryName { get; set; }
    }
}
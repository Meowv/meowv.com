using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Tags
{
    /// <summary>
    /// 标签实体
    /// </summary>
    public class Tag : FullAuditedEntity, IEntity<int>
    {
        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }
    }
}
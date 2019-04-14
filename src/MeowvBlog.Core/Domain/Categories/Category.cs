using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Categories
{
    /// <summary>
    /// 分类实体
    /// </summary>
    public class Category : FullAuditedEntity, IEntity<int>
    {

    }
}
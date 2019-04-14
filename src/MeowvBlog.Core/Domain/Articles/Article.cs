using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章实体
    /// </summary>
    public class Article : FullAuditedEntity, IEntity<int>
    {

    }
}
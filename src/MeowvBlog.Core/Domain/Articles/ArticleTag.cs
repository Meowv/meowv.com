using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章对应标签实体
    /// </summary>
    public class ArticleTag : FullAuditedEntity, IEntity<int>
    {

    }
}
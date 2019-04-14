using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章对应分类实体
    /// </summary>
    public class ArticleCategory : FullAuditedEntity, IEntity<int>
    {

    }
}
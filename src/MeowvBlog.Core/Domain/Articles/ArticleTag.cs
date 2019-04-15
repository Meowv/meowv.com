using UPrime.Domain.Entities;
using UPrime.Domain.Entities.Auditing;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章对应标签实体
    /// </summary>
    public class ArticleTag : FullAuditedEntity, IEntity<int>
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int ArticleId { get; set; }

        /// <summary>
        /// 标签Id
        /// </summary>
        public int TagId { get; set; }
    }
}
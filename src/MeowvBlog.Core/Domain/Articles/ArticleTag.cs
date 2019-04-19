using UPrime.Domain.Entities;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章对应标签实体
    /// </summary>
    public class ArticleTag : Entity
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
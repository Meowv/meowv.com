using UPrime.Domain.Entities;

namespace MeowvBlog.Core.Domain.Articles
{
    /// <summary>
    /// 文章对应分类实体
    /// </summary>
    public class ArticleCategory : Entity
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int ArticleId { get; set; }

        /// <summary>
        /// 分类Id
        /// </summary>
        public int CategoryId { get; set; }
    }
}
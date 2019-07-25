using Plus.Domain.Entities;

namespace MeowvBlog.Core.Domain.Blog
{
    public class PostTag : Entity
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int PostId { get; set; }

        /// <summary>
        /// 标签Id
        /// </summary>
        public int TagId { get; set; }
    }
}
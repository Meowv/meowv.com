using Plus.Domain.Entities;

namespace MeowvBlog.Core.Domain.Blog
{
    public class PostTag : Entity
    {
        /// <summary>
        /// PostId
        /// </summary>
        public int PostId { get; set; }

        /// <summary>
        /// 标签Id
        /// </summary>
        public int TagId { get; set; }
    }
}
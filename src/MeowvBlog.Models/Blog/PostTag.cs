using MeowvBlog.Entities;

namespace MeowvBlog.Models.Blog
{
    public class PostTag : Entity
    {
        /// <summary>
        /// 标签Id
        /// </summary>
        public int TagId { get; set; }

        /// <summary>
        /// Post
        /// </summary>
        public virtual Post Post { get; set; }

        /// <summary>
        /// Tag
        /// </summary>
        public virtual Tag Tag { get; set; }
    }
}
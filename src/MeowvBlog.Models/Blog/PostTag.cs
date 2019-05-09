namespace MeowvBlog.Models.Blog
{
    public class PostTag
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

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
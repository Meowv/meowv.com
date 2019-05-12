namespace MeowvBlog.Models.Blog
{
    public class PostTag
    {
        /// <summary>
        /// PostId
        /// </summary>
        public int PostId { get; set; }

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
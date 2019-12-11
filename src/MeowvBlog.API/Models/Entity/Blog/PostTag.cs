namespace MeowvBlog.API.Models.Entity.Blog
{
    /// <summary>
    /// PostTag
    /// </summary>
    public class PostTag
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

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
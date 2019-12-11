namespace MeowvBlog.API.Models.Entity.Blog
{
    /// <summary>
    /// FriendLink
    /// </summary>
    public class FriendLink
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 标题
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// 链接
        /// </summary>
        public string LinkUrl { get; set; }
    }
}
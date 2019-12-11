namespace MeowvBlog.API.Models.Entity.Blog
{
    /// <summary>
    /// Tag
    /// </summary>
    public class Tag
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }
    }
}
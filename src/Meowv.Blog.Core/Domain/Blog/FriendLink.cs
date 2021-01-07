namespace Meowv.Blog.Domain.Blog
{
    public class FriendLink : EntityBase
    {
        /// <summary>
        /// 名称
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 网址
        /// </summary>
        public string Url { get; set; }
    }
}
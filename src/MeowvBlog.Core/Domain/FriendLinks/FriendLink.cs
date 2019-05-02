using UPrime.Domain.Entities;

namespace MeowvBlog.Core.Domain.FriendLinks
{
    /// <summary>
    /// 友情链接实体
    /// </summary>
    public class FriendLink : Entity
    {
        /// <summary>
        /// 名称
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// 链接
        /// </summary>
        public string LinkUrl { get; set; }
    }
}
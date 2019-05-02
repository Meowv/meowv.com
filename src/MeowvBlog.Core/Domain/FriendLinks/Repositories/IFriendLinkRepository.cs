using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.FriendLinks.Repositories
{
    /// <summary>
    /// 友情链接仓储接口
    /// </summary>
    public interface IFriendLinkRepository : IRepository<FriendLink, int> { }
}
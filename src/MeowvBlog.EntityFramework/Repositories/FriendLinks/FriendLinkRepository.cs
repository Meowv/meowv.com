using MeowvBlog.Core.Domain.FriendLinks;
using MeowvBlog.Core.Domain.FriendLinks.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.FriendLinks
{
    /// <summary>
    /// 友情链接仓储接口实现
    /// </summary>
    public class FriendLinkRepository : MeowvBlogRepositoryBase<FriendLink>, IFriendLinkRepository
    {
        public FriendLinkRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
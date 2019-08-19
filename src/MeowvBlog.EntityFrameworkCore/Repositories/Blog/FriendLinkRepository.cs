using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Blog.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories.Blog
{
    public class FriendLinkRepository : MeowvBlogRepositoryBase<FriendLink, string>, IFriendLinkRepository
    {
        public FriendLinkRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
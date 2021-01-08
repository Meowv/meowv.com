using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Blog
{
    public class FriendLinkRepository : MongoDbRepositoryBase<FriendLink>, IFriendLinkRepository
    {
        public FriendLinkRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
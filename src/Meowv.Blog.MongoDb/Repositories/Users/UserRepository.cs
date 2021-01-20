using Meowv.Blog.Domain.Users;
using Meowv.Blog.Domain.Users.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Users
{
    public class UserRepository : MongoDbRepositoryBase<User>, IUserRepository
    {
        public UserRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
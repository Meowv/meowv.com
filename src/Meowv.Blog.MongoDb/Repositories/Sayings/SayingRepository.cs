using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Domain.Sayings.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Sayings
{
    public class SayingRepository : MongoDbRepositoryBase<Saying>, ISayingRepository
    {
        public SayingRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
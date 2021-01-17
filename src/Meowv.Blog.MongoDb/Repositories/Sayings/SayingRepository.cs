using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Domain.Sayings.Repositories;
using MongoDB.Driver;
using MongoDB.Driver.Linq;
using System.Threading.Tasks;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Sayings
{
    public class SayingRepository : MongoDbRepositoryBase<Saying>, ISayingRepository
    {
        public SayingRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<Saying> GetRandomAsync()
        {
            return await Collection.AsQueryable().Sample(1).FirstOrDefaultAsync();
        }
    }
}
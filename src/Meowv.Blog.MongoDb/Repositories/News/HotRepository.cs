using Meowv.Blog.Domain.News;
using Meowv.Blog.Domain.News.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.News
{
    public class HotRepository : MongoDbRepositoryBase<Hot>, IHotRepository
    {
        public HotRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<List<Hot>> GetSourcesAsync()
        {
            var projection = new BsonDocument
            {
                { "source", 1 }
            };

            return await Collection.Find(new BsonDocument()).Project<Hot>(projection).ToListAsync();
        }
    }
}
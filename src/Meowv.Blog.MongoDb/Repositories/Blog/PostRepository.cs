using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Blog
{
    public class PostRepository : MongoDbRepositoryBase<Post>, IPostRepository
    {
        public PostRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<Tuple<int, List<Post>>> GetPagedListAsync(int skipCount, int maxResultCount)
        {
            var filter = new BsonDocument();
            var sort = new BsonDocument { { "createdAt", -1 } };
            var projection = new BsonDocument
            {
                { "title", 1 },
                { "url", 1 },
                { "author", 1 },
                { "category", 1 },
                { "tags", 1 },
                { "createdAt", 1 }
            };

            var total = await Collection.CountDocumentsAsync(filter);
            var list = await Collection.Find(filter)
                                       .Sort(sort)
                                       .Project<Post>(projection)
                                       .Skip((skipCount - 1) * maxResultCount)
                                       .Limit(maxResultCount)
                                       .ToListAsync();
            return new Tuple<int, List<Post>>((int)total, list);
        }

        public async Task<List<Post>> GetListByCategoryAsync(string category)
        {
            var filter = new BsonDocument
            {
                { "category.alias",  category }
            };
            var sort = new BsonDocument { { "createdAt", -1 } };
            var projection = new BsonDocument
            {
                { "_id", 0 },
                { "title", 1 },
                { "url", 1 },
                { "createdAt", 1 }
            };

            return await Collection.Find(filter).Sort(sort).Project<Post>(projection).ToListAsync();
        }

        public async Task<List<Post>> GetListByTagAsync(string tag)
        {
            var filter = new BsonDocument
            {
                { "tags.alias",  tag }
            };
            var sort = new BsonDocument { { "createdAt", -1 } };
            var projection = new BsonDocument
            {
                { "_id", 0 },
                { "title", 1 },
                { "url", 1 },
                { "createdAt", 1 }
            };

            return await Collection.Find(filter).Sort(sort).Project<Post>(projection).ToListAsync();
        }

        public async Task<int> GetCountByCategoryAsync(ObjectId id)
        {
            var filter = new BsonDocument
            {
                { "category._id",  id }
            };

            return (int)await Collection.CountDocumentsAsync(filter);
        }

        public async Task<int> GetCountByTagAsync(ObjectId id)
        {
            var filter = new BsonDocument
            {
                { "tags._id",  id }
            };

            return (int)await Collection.CountDocumentsAsync(filter);
        }
    }
}
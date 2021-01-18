using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Signatures.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Signatures
{
    public class SignatureRepository : MongoDbRepositoryBase<Signature>, ISignatureRepository
    {
        public SignatureRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<Tuple<int, List<Signature>>> GetPagedListAsync(int skipCount, int maxResultCount)
        {
            var filter = new BsonDocument();
            var total = await Collection.CountDocumentsAsync(filter);
            var list = await Collection.Find(filter)
                                       .Skip((skipCount - 1) * maxResultCount)
                                       .Limit(maxResultCount)
                                       .ToListAsync();
            return new Tuple<int, List<Signature>>((int)total, list);
        }
    }
}
using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Signatures.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Signatures
{
    public class SignatureRepository : MongoDbRepositoryBase<Signature>, ISignatureRepository
    {
        public SignatureRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
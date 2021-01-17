using MongoDB.Bson;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Signatures.Repositories
{
    public interface ISignatureRepository : IRepository<Signature, ObjectId>
    {
    }
}
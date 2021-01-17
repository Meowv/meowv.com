using Meowv.Blog.Domain.Repositories;
using MongoDB.Bson;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Sayings.Repositories
{
    public interface ISayingRepository : IRepository<Saying, ObjectId>, IBulkRepository<Saying>
    {
    }
}
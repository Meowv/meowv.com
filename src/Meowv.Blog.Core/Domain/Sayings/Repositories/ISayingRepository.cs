using Meowv.Blog.Domain.Repositories;
using MongoDB.Bson;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Sayings.Repositories
{
    public interface ISayingRepository : IRepository<Saying, ObjectId>, IBulkRepository<Saying>
    {
        /// <summary>
        /// Get a saying.
        /// </summary>
        /// <returns></returns>
        Task<Saying> GetRandomAsync();
    }
}
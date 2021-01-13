using Meowv.Blog.Domain.Repositories;
using MongoDB.Bson;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.News.Repositories
{
    public interface IHotRepository : IRepository<Hot, ObjectId>, IBulkRepository<Hot>
    {
    }
}
using MongoDB.Bson;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Blog.Repositories
{
    public interface ICategoryRepository : IRepository<Category, ObjectId>
    {
    }
}
using MongoDB.Bson;
using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Domain
{
    public abstract class EntityBase : Entity<ObjectId>
    {
    }
}
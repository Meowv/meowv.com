using MongoDB.Bson;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Messages.Repositories
{
    public interface IMessageRepository : IRepository<Message, ObjectId>
    {
    }
}
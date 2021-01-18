using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Messages.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Messages
{
    public class MessageRepository : MongoDbRepositoryBase<Message>, IMessageRepository
    {
        public MessageRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
using Meowv.Blog.Domain.Messages.Repositories;

namespace Meowv.Blog.Messages.Impl
{
    public partial class MessageService : ServiceBase, IMessageService
    {
        private readonly IMessageRepository _messages;

        public MessageService(IMessageRepository messages)
        {
            _messages = messages;
        }
    }
}
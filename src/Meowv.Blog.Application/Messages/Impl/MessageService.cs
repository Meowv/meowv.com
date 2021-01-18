using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Messages.Repositories;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Messages.Impl
{
    public class MessageService : ServiceBase, IMessageService
    {
        private readonly IMessageRepository _messages;

        public MessageService(IMessageRepository messages)
        {
            _messages = messages;
        }

        public async Task<BlogResponse> CreateAsync()
        {
            await _messages.InsertAsync(new Message
            {
                Name = "阿星Plus",
                Content = "测试0",
                Reply = new List<MessageReply>
                {
                    new MessageReply
                    {
                        Name = "哈哈哈",
                        Content = "测试1"
                    },
                    new MessageReply
                    {
                        Name = "哈哈哈",
                        Content = "测试2"
                    }
                }
            });

            return new BlogResponse();
        }
    }
}
using System.Collections.Generic;

namespace Meowv.Blog.Domain.Messages
{
    public class Message : MessageReply
    {
        public List<MessageReply> Reply { get; set; }
    }
}
using System.Collections.Generic;

namespace Meowv.Blog.Dto.Messages
{
    public class MessageDto : MessageReplyDto
    {
        public List<MessageReplyDto> Reply { get; set; }
    }
}
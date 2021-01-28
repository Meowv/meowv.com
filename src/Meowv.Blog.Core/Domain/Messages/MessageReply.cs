using MongoDB.Bson;
using System;

namespace Meowv.Blog.Domain.Messages
{
    public class MessageReply : EntityBase
    {
        public MessageReply()
        {
            Id = ObjectId.GenerateNewId();
            CreatedAt = DateTime.Now;
        }

        public string UserId { get; set; }

        public string Name { get; set; }

        public string Avatar { get; set; }

        public string Content { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
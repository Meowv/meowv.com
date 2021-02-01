using Html2Markdown;
using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Messages.Repositories;
using Meowv.Blog.Domain.Users.Repositories;
using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Extensions;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.DataSeed
{
    public class MessageDataSeedService : ITransientDependency
    {
        private readonly IMessageRepository _messages;
        private readonly IUserRepository _users;

        public MessageDataSeedService(IMessageRepository messages, IUserRepository users)
        {
            _messages = messages;
            _users = users;
        }

        public async Task SeedAsync()
        {
            if (await _messages.GetCountAsync() > 0) return;

            var path = Path.Combine(Directory.GetCurrentDirectory(), "messages.json");

            var messages = await path.FromJsonFile<List<MessageModel>>("RECORDS");
            if (!messages.Any()) return;

            var data = new List<Message>();
            var users = await _users.GetListAsync();

            var me = users.First();
            var wife = users.Last();

            foreach (var item in messages)
            {
                var replyData = new List<MessageReply>();
                if (!item.ReplyList.IsNullOrEmpty())
                {
                    foreach (var reply in item.ReplyList.DeserializeToObject<List<ReplyList>>())
                    {
                        var messageReply = new MessageReply();

                        if (reply.Nick == "阿星Plus")
                        {
                            messageReply.UserId = me.Id.ToString();
                            messageReply.Name = me.Name;
                            messageReply.Avatar = me.Avatar;
                        }
                        else
                        {
                            messageReply.UserId = wife.Id.ToString();
                            messageReply.Name = wife.Name;
                            messageReply.Avatar = wife.Avatar;
                        }

                        messageReply.Content = new Converter().Convert(reply.Content);
                        messageReply.CreatedAt = $"{reply.Time}".TimestampToDateTime();

                        replyData.Add(messageReply);
                    }
                }
                data.Add(new Message
                {
                    UserId = wife.Id.ToString(),
                    Name = wife.Name,
                    Avatar = wife.Avatar,
                    Content = new Converter().Convert(item.HtmlContent),
                    CreatedAt = $"{item.PubTime}".TimestampToDateTime(),
                    Reply = replyData
                });
            }

            await _messages.InsertManyAsync(data);

            Console.WriteLine($"Successfully processed {data.Count} message data.");
        }
    }
}
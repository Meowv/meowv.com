using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Messages.Repositories;
using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Dto.Messages.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Messages.Impl
{
    [Authorize]
    public partial class MessageService : ServiceBase, IMessageService
    {
        private readonly IMessageRepository _messages;

        public MessageService(IMessageRepository messages)
        {
            _messages = messages;
        }

        /// <summary>
        /// Create a message.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/message")]
        public async Task<BlogResponse> CreateAsync(CreateMessageInput input)
        {
            var response = new BlogResponse();

            await _messages.InsertAsync(new Message
            {
                Name = input.Name,
                Content = input.Content,
                Avatar = input.Avatar,
                UserId = input.UserId
            });

            return response;
        }

        /// <summary>
        /// Reply to a message.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/message/reply/{id}")]
        public async Task<BlogResponse> ReplyAsync(string id, ReplyMessageInput input)
        {
            var response = new BlogResponse();

            var message = await _messages.FindAsync(id.ToObjectId());
            if (message is null)
            {
                response.IsFailed($"The message id not exists.");
                return response;
            }

            var reply = message.Reply ?? new List<MessageReply>();
            reply.Add(new MessageReply
            {
                Name = input.Name,
                Content = input.Content,
                Avatar = input.Avatar,
                UserId = input.UserId
            });
            message.Reply = reply;

            await _messages.UpdateAsync(message);

            return response;
        }

        /// <summary>
        /// Delete a message by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Route("api/meowv/message/{id}")]
        public async Task<BlogResponse> DeleteAsync(string id)
        {
            var response = new BlogResponse();

            var message = await _messages.FindAsync(id.ToObjectId());
            if (message is null)
            {
                response.IsFailed($"The message id not exists.");
                return response;
            }

            if (message.Reply is not null)
            {
                if (message.Reply.Any())
                {
                    response.IsFailed($"The reply message is not empty.");
                    return response;
                }
            }

            await _messages.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Delete a reply message by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="replyId"></param>
        /// <returns></returns>
        [Route("api/meowv/message/reply/{id}/{replyId}")]
        public async Task<BlogResponse> DeleteReplyAsync(string id, string replyId)
        {
            var response = new BlogResponse();

            var message = await _messages.FindAsync(id.ToObjectId());
            if (message is null)
            {
                response.IsFailed($"The message id not exists.");
                return response;
            }

            message.Reply = message.Reply?.Where(x => x.Id != replyId.ToObjectId()).ToList();

            await _messages.UpdateAsync(message);

            return response;
        }

        /// <summary>
        /// Get the list of messages by paging.
        /// </summary>
        /// <param name="page"></param>
        /// <param name="limit"></param>
        /// <returns></returns>
        [Route("api/meowv/messages/{page}/{limit}")]
        public async Task<BlogResponse<PagedList<MessageDto>>> GetMessagesAsync(int page, int limit)
        {
            var response = new BlogResponse<PagedList<MessageDto>>();

            var result = await _messages.GetPagedListAsync(page, limit);
            var total = result.Item1;
            var messages = ObjectMapper.Map<List<Message>, List<MessageDto>>(result.Item2);

            response.Result = new PagedList<MessageDto>(total, messages);
            return response;
        }
    }
}
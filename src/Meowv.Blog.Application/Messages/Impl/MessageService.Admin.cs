using Meowv.Blog.Domain.Messages;
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
    public partial class MessageService
    {
        /// <summary>
        /// Create a message.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/message")]
        public async Task<BlogResponse> CreateAsync(CreateMessageInput input)
        {
            var response = new BlogResponse();

            await _messages.InsertAsync(new Message
            {
                Name = input.Name,
                Content = input.Content
            });

            return response;
        }

        /// <summary>
        /// Reply to a message.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
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
                Content = input.Content
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
        [Authorize]
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

            if (message.Reply.Any())
            {
                response.IsFailed($"The reply message is not empty.");
                return response;
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
        [Authorize]
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
            if (!message.Reply.Any())
            {
                response.IsFailed($"The reply message is empty.");
                return response;
            }

            await _messages.UpdateAsync(message);

            return response;
        }
    }
}
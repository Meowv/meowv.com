using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Dto.Messages.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Messages
{
    public partial interface IMessageService
    {
        Task<BlogResponse> CreateAsync(CreateMessageInput input);

        Task<BlogResponse> ReplyAsync(string id, ReplyMessageInput input);

        Task<BlogResponse> DeleteAsync(string id);

        Task<BlogResponse> DeleteReplyAsync(string id, string replyId);

        Task<BlogResponse<PagedList<MessageDto>>> GetMessagesAsync(int page, int limit);
    }
}
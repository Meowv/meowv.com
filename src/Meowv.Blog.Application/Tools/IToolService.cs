using Meowv.Blog.Dto.Tools.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Tools
{
    public interface IToolService
    {
        Task<BlogResponse> SendMessageAsync(SendMessageInput input);
    }
}
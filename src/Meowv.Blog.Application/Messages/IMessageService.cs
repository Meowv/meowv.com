using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Messages
{
    public interface IMessageService
    {
        Task<BlogResponse> CreateAsync();
    }
}
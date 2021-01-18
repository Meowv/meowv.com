using Meowv.Blog.Dto.Tools.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Tools
{
    public interface IToolService
    {
        Task<BlogResponse<List<string>>> Ip2RegionAsync(string ip);

        Task<BlogResponse> SendMessageAsync(SendMessageInput input);
    }
}
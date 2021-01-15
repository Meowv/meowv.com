using Meowv.Blog.Dto.News.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.News
{
    public interface IHotService
    {
        Task<BlogResponse<Dictionary<string, string>>> GetSourcesAsync();

        Task<BlogResponse<HotDto>> GetHotsAsync(string source);
    }
}
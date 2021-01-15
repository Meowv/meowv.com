using Meowv.Blog.Dto.News;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.News
{
    public interface IHotService
    {
        Task<BlogResponse<List<HotSourceDto>>> GetSourcesAsync();

        Task<BlogResponse<HotDto>> GetHotsAsync(string id);
    }
}
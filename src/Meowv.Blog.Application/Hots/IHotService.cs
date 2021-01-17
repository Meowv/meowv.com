using Meowv.Blog.Dto.Hots;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Hots
{
    public interface IHotService
    {
        Task<BlogResponse<List<HotSourceDto>>> GetSourcesAsync();

        Task<BlogResponse<HotDto>> GetHotsAsync(string id);
    }
}
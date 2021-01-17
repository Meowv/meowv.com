using Meowv.Blog.Dto.Sayings;
using Meowv.Blog.Dto.Sayings.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Sayings
{
    public partial interface ISayingService
    {
        Task<BlogResponse> CreateAsync(CreateInput input);

        Task<BlogResponse> DeleteAsync(string id);

        Task<BlogResponse<PagedList<SayingDto>>> GetSayingsAsync(int page, int limit);
    }
}
using Meowv.Blog.Dto.Sayings.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Sayings
{
    public partial interface ISayingService
    {
        Task<BlogResponse> CreateAsync(CreateInput input);
    }
}
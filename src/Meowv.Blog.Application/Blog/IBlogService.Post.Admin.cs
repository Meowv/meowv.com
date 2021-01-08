using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse> CreatePostAsync(CreatePostInput input);
    }
}
using Meowv.Blog.Dto;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse<PostDetailDto>> GetPost(string url);

        Task<BlogResponse<PagedList<GetPostDto>>> GetPostsAsync(PagingInput input);
    }
}
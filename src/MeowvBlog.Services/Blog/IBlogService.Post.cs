using MeowvBlog.Services.Dto.Blog;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        Task<PostDto> Get(int id);
    }
}
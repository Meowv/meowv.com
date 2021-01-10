using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse> CreateTagAsync(CreateTagInput input);

        Task<BlogResponse> DeleteTagAsync(string id);

        Task<BlogResponse> UpdateTagAsync(string id, UpdateTagInput input);

        Task<BlogResponse<List<GetAdminTagDto>>> GetAdminTagsAsync();
    }
}
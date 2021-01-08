using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse> CreateCategoryAsync(CreateCategoryInput input);

        Task<BlogResponse> DeleteCategoryAsync(string id);

        Task<BlogResponse> UpdateCategoryAsync(string id, UpdateCategoryInput input);
    }
}
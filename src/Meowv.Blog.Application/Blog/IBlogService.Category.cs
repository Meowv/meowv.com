using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse<List<GetCategoryDto>>> GetCategoriesAsync();
    }
}
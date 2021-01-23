using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Posts
{
    public class CategoryModel : PageBase
    {
        public CategoryModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        public BlogResponse<List<GetPostDto>> Posts { get; set; }

        public async Task OnGetAsync(string category)
        {
            Posts = await GetResultAsync<BlogResponse<List<GetPostDto>>>($"api/meowv/blog/posts/category/{category}");
        }
    }
}
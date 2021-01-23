using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Categories
{
    public class IndexModel : PageBase
    {
        public IndexModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        public BlogResponse<List<GetCategoryDto>> Categories { get; set; }

        public async Task OnGetAsync()
        {
            Categories = await GetResultAsync<BlogResponse<List<GetCategoryDto>>>("api/meowv/blog/categories");
        }
    }
}
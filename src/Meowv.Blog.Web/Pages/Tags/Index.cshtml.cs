using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Tags
{
    public class IndexModel : PageBase
    {
        public IndexModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        [BindProperty]
        public BlogResponse<List<GetTagDto>> Tags { get; set; }

        public async Task OnGetAsync()
        {
            Tags = await GetResultAsync<BlogResponse<List<GetTagDto>>>("api/meowv/blog/tags");
        }
    }
}
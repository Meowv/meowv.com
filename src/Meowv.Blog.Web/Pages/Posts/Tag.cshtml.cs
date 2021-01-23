using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Posts
{
    public class TagModel : PageBase
    {
        public TagModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        [BindProperty]
        public BlogResponse<List<GetPostDto>> Posts { get; set; }

        public async Task OnGetAsync(string tag)
        {
            Posts = await GetResultAsync<BlogResponse<List<GetPostDto>>>($"api/meowv/blog/posts/tag/{tag}");
        }
    }
}
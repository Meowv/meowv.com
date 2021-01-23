using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Posts
{
    public class PostModel : PageBase
    {
        public PostModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        [BindProperty]
        public BlogResponse<PostDetailDto> Post { get; set; }

        public async Task OnGetAsync(string url)
        {
            Post = await GetResultAsync<BlogResponse<PostDetailDto>>($"api/meowv/blog/post?url={url}");
        }
    }
}
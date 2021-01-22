using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Posts
{
    public class IndexModel : PageBase
    {
        public IndexModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        [BindProperty(SupportsGet = true)]
        public int PageIndex { get; set; } = 1;

        [BindProperty]
        public override int PageSize { get; set; } = 15;

        [BindProperty]
        public BlogResponse<PagedList<GetPostDto>> Posts { get; set; }

        public async Task OnGetAsync(int PageIndex = 1)
        {
            var json = await http.GetStringAsync($"api/meowv/blog/posts/{PageIndex}/{PageSize}");
            Posts = To<BlogResponse<PagedList<GetPostDto>>>(json);
        }
    }
}
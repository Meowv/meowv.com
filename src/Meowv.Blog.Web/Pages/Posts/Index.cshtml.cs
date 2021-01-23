using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Posts
{
    public class IndexModel : PageBase
    {
        public IndexModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        public int PageIndex { get; set; }

        public override int PageSize { get; set; } = 15;

        public BlogResponse<PagedList<GetPostDto>> Posts { get; set; }

        public async Task OnGetAsync(int pageIndex = 1)
        {
            PageIndex = pageIndex;

            Posts = await GetResultAsync<BlogResponse<PagedList<GetPostDto>>>($"api/meowv/blog/posts/{PageIndex}/{PageSize}");
        }
    }
}
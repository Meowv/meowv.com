using Meowv.Blog.Response;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Apps
{
    public class BingModel : PageBase
    {
        public BingModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        public string ImgUrl { get; set; }

        public async Task OnGetAsync()
        {
            var response = await GetResultAsync<BlogResponse<string>>("api/meowv/tool/bing/url");
            ImgUrl = response.Result;
        }
    }
}
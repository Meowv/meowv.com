using Microsoft.AspNetCore.Mvc.RazorPages;
using Newtonsoft.Json;
using System.Net.Http;

namespace Meowv.Blog.Web.Pages
{
    public abstract class PageBase : PageModel
    {
        protected readonly HttpClient http;

        public virtual int PageSize { get; set; } = 15;

        public PageBase(IHttpClientFactory httpClientFactory)
        {
            http = httpClientFactory.CreateClient("api");
        }

        public T To<T>(string json) => JsonConvert.DeserializeObject<T>(json);
    }
}
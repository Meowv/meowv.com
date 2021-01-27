using AntDesign;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Services
{
    public abstract class PageBase : AntDomComponentBase
    {
        private readonly HttpClient http;

        public PageBase(IHttpClientFactory httpClientFactory)
        {
            http = httpClientFactory.CreateClient("api");
        }

        public virtual int PageSize { get; set; } = 15;

        public virtual async Task<string> GetTokenAsync()
        {
            return await Js.InvokeAsync<string>("window.func.getStorage", "token");
        }

        public virtual async Task<T> GetResultAsync<T>(string url)
        {
            var json = await http.GetStringAsync(url);
            return JsonConvert.DeserializeObject<T>(json);
        }
    }
}
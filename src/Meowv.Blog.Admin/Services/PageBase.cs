using AntDesign;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Services
{
    public class PageBase : AntDomComponentBase
    {
        private HttpClient http;

        [Inject] IHttpClientFactory HttpClientFactory { get; set; }

        [Inject] public MessageService Message { get; set; }

        [Inject] public NavigationManager NavigationManager { get; set; }

        public virtual async Task<T> GetResultAsync<T>(string url, string json = "", HttpMethod method = null)
        {
            http = HttpClientFactory.CreateClient("api");

            var token = await Js.InvokeAsync<string>("localStorage.getItem", "token");
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            string response;

            if (method is null || method == HttpMethod.Get)
            {
                response = await http.GetStringAsync(url);
            }
            else
            {
                var content = new ByteArrayContent(Encoding.UTF8.GetBytes(json));
                content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

                var httpResponse = new HttpResponseMessage();

                if (method == HttpMethod.Post)
                {
                    httpResponse = await http.PostAsync(url, content);
                }
                else if (method == HttpMethod.Put)
                {
                    httpResponse = await http.PutAsync(url, content);
                }
                else if (method == HttpMethod.Delete)
                {
                    httpResponse = await http.DeleteAsync(url);
                }

                response = await httpResponse.Content.ReadAsStringAsync();
            }

            return JsonConvert.DeserializeObject<T>(response);
        }
    }
}
using Meowv.Blog.Dto.Tools.Params;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

namespace Meowv.Blog.Tools.Impl
{
    public class ToolService : ServiceBase, IToolService
    {
        private readonly IHttpClientFactory _httpClient;

        public ToolService(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// Send a message to weixin.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/tool/send")]
        public async Task<BlogResponse> SendMessageAsync(SendMessageInput input)
        {
            var response = new BlogResponse();

            var content = new StringContent($"text={input.Text}&desp={input.Desc}");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");
            using var client = _httpClient.CreateClient();
            await client.PostAsync("https://sc.ftqq.com/SCU60393T5a94df1d5a9274125293f34a6acf928f5d78f551cf6d6.send", content);

            return response;
        }
    }
}
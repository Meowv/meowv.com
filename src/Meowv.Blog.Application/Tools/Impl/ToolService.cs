using IP2Region;
using Meowv.Blog.Dto.Tools.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

namespace Meowv.Blog.Tools.Impl
{
    public class ToolService : ServiceBase, IToolService
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public ToolService(IHttpClientFactory httpClient, IHttpContextAccessor httpContextAccessor)
        {
            _httpClient = httpClient;
            _httpContextAccessor = httpContextAccessor;
        }

        /// <summary>
        /// Get the region by ip address.
        /// </summary>
        /// <param name="ip"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("api/meowv/tool/ip2region")]
        public async Task<BlogResponse<List<string>>> Ip2RegionAsync(string ip)
        {
            var response = new BlogResponse<List<string>>();

            if (ip.IsNullOrEmpty())
            {
                ip = _httpContextAccessor.HttpContext.Request.GetIpAddress();
            }
            else
            {
                if (!ip.IsIp())
                {
                    response.IsFailed("The ip address error.");
                    return response;
                }
            }

            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/ip2region.db");

            using var _search = new DbSearcher(path);
            var block = await _search.BinarySearchAsync(ip);

            var region = block.Region.Split("|").Distinct().Where(x => x != "0").ToList();

            region.AddFirst(ip);

            response.Result = region;
            return response;
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
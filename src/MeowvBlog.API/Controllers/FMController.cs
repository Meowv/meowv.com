using MeowvBlog.API.Extensions;
using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Dto;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class FMController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;

        public FMController(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("channels")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<dynamic>> GetChannels()
        {
            var response = new Response<dynamic>();

            using var client = _httpClient.CreateClient();
            var result = await client.GetStringAsync(AppSettings.FMApi.Channels);

            response.Result = result.DeserializeFromJson<dynamic>()["channels"];
            return response;
        }

        /// <summary>
        /// 获取随机歌曲
        /// </summary>
        /// <param name="channel"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("song")]
        public async Task<Response<dynamic>> GetSong(string channel = "")
        {
            var response = new Response<dynamic>();

            var url = $"{AppSettings.FMApi.Song}{channel}";
            using var client = _httpClient.CreateClient();
            var result = await client.GetStringAsync(url);

            response.Result = result.DeserializeFromJson<dynamic>()["song"];

            return response;
        }

        /// <summary>
        /// 获取歌词
        /// </summary>
        /// <param name="sid"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("lyric")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "sid" })]
        public async Task<Response<string>> GeyLyric(string sid)
        {
            var response = new Response<string>();

            var url = $"{AppSettings.FMApi.Lyric}{sid}";
            using var client = _httpClient.CreateClient();
            var result = await client.GetStringAsync(url);

            if (result.Contains("error"))
            {
                response.Msg = "no lyric";
                return response;
            }

            string lyric = result.DeserializeFromJson<dynamic>()["lyric"];
            response.Result = lyric.Replace(AppSettings.FMApi.Key, "meowv.com");
            return response;
        }
    }
}
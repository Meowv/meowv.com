using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Models.Dto.FM;
using MeowvBlog.API.Models.Dto.Response;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
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
            result = result.Replace("http:", "https:");

            response.Result = result.DeserializeFromJson<dynamic>()["channels"];
            return response;
        }

        /// <summary>
        /// 获取随机一首歌曲
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
            result = result.Replace("http:", "https:");

            response.Result = result.DeserializeFromJson<dynamic>()["song"];

            return response;
        }

        /// <summary>
        /// 获取歌曲列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("songs")]
        public async Task<Response<IList<FmDto>>> GetSongs()
        {
            var response = new Response<IList<FmDto>>();

            using var client = _httpClient.CreateClient();
            var json = await client.GetStringAsync(AppSettings.FMApi.Channels);

            var list_task = new List<Task<dynamic>>();
            var channels = json.DeserializeFromJson<dynamic>()["channels"];
            foreach (var item in channels)
            {
                var channel = item["channel_id"];
                var url = $"{AppSettings.FMApi.Song}{channel}";

                var task = Task.Run(async () =>
                {
                    var result = await client.GetStringAsync(url);
                    result = result.Replace("http:", "https:");
                    return result.DeserializeFromJson<dynamic>()["song"];
                });
                list_task.Add(task);
            }
            Task.WaitAll(list_task.ToArray());

            var result = new List<FmDto>();

            foreach (var item in list_task)
            {
                var fm = item.Result[0];
                result.Add(new FmDto
                {
                    Title = fm.title,
                    Artist = fm.artist,
                    Cover = fm.picture,
                    Url = fm.url,
                    Lrc = fm.lrc
                });
            }

            result = result.OrderBy(x => Guid.NewGuid()).ToList();
            response.Result = result;
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

            result = result.Replace(AppSettings.FMApi.Key, "meowv.com");
            response.Result = result.DeserializeFromJson<dynamic>()["lyric"];
            return response;
        }
    }
}
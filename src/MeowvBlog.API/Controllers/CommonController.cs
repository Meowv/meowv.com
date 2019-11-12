using Baidu.Aip.Speech;
using MeowvBlog.API.Extensions;
using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Domain.HotNews;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.HotNews;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Extension = MeowvBlog.API.Extensions.Extensions;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class CommonController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly MeowvBlogDBContext _context;

        public CommonController(IHttpClientFactory httpClient, MeowvBlogDBContext context)
        {
            _httpClient = httpClient;
            _context = context;
        }

        /// <summary>
        /// 获取每日热点来源列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("hot_news_source")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetHotNewsSourceAsync()
        {
            var response = new Response<IList<EnumResponse>>();
            var result = Extension.EnumToList<HotNewsSource>();
            response.Result = result;
            return await Task.FromResult(response);
        }

        /// <summary>
        /// 获取对应的每日热点列表
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("hot_news")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "sourceId" })]
        public async Task<Response<IList<HotNewsDto>>> GetHotNewsAsync(int sourceId)
        {
            var response = new Response<IList<HotNewsDto>>();

            var result = await _context.HotNews.Where(x => x.SourceId.Equals(sourceId)).Select(x => new HotNewsDto
            {
                Title = x.Title,
                Url = x.Url
            }).ToListAsync();

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 批量插入每日热点数据
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("hot_news")]
        public async Task<Response<string>> BulkInsertHotNewsAsync([FromBody] IList<InsertHotNewsDto> dtos)
        {
            var response = new Response<string>();

            string spider = HttpContext.Request.Headers["spider"];
            if (spider != "python")
            {
                response.Msg = "缺少HEADERS值";
                return response;
            }

            var hotNews = dtos.Select(x => new HotNews
            {
                Id = Extension.GenerateGuid(),
                Title = x.Title,
                Url = x.Url,
                SourceId = x.SourceId,
                Date = DateTime.Now
            });

            _context.HotNews.RemoveRange(_context.HotNews.Where(x => dtos.Select(z => z.SourceId).Contains(x.SourceId)));
            await _context.SaveChangesAsync();

            await _context.HotNews.AddRangeAsync(hotNews);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 必应每日壁纸
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("bing")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<IActionResult> GetBingAsync()
        {
            var api = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&pid=hp&FORM=BEHPTB";

            using var client = _httpClient.CreateClient();
            var json = await client.GetStringAsync(api);
            var obj = JObject.Parse(json);
            var url = "https://cn.bing.com" + obj["images"].First()["url"].ToString();
            var bytes = await client.GetByteArrayAsync(url);

            return File(bytes, "image/jpeg");
        }

        /// <summary>
        /// 随机一张猫图
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("cat")]
        public async Task<IActionResult> GetCatAsync()
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/cats.json");

            var cats = await path.GetObjFromJsonFile<List<string>>("cats");

            var url = cats.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            using var client = _httpClient.CreateClient();
            var bytes = await client.GetByteArrayAsync(url);

            return File(bytes, "image/jpeg");
        }

        /// <summary>
        /// 语音合成
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("tts")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<IActionResult> SpeechTtsAsync()
        {
            var ip = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (string.IsNullOrEmpty(ip)) ip = Request.HttpContext.Connection.RemoteIpAddress.ToString();
            if (ip.Contains(":")) ip = "127.0.0.1";

            using var client = _httpClient.CreateClient();
            var cityjson = await client.GetStringAsync($"http://ip.taobao.com/service/getIpInfo.php?ip={ip}");
            var cityObj = JObject.Parse(cityjson);
            var city = cityObj["data"]["city"].ToString();

            var noteJson = await client.GetStringAsync("http://open.iciba.com/dsapi/");
            var noteObj = JObject.Parse(noteJson);
            var note = noteObj["note"].ToString();

            var _ttsClient = new Tts(AppSettings.BaiduAI.APIKey, AppSettings.BaiduAI.SecretKey) { Timeout = 60000 };

            // https://ai.baidu.com/docs#/TTS-Online-Csharp-SDK/d27a4e02
            var option = new Dictionary<string, object>()
            {
                {"spd", 5}, // 语速，取值0-9，默认为5中语速
                {"vol", 7}, // 音量，取值0-15，默认为5中音量
                {"per", 4}  // 发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫
            };

            var result = _ttsClient.Synthesis(string.Format(GlobalConsts.GreetWord, city, note), option);

            if (result.Success)
            {
                return File(result.Data, "audio/mpeg");
            }
            else
            {
                var ttsBytes = await client.GetByteArrayAsync(noteObj["tts"].ToString());
                return File(ttsBytes, "audio/mpeg");
            }
        }
    }
}
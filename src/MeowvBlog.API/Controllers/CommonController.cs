using Baidu.Aip.Speech;
using IP2Region;
using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.HotNews;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Entity.HotNews;
using MeowvBlog.API.Models.Enum;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using TencentCloud.Cdn.V20180606;
using TencentCloud.Cdn.V20180606.Models;
using TencentCloud.Common;
using TencentCloud.Common.Profile;
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
        /// 随机一张妹子图
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("girl")]
        public async Task<IActionResult> GetGirlAsync()
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/girls.json");

            var girls = await path.GetObjFromJsonFile<List<string>>("girls");

            var url = girls.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            using var client = _httpClient.CreateClient();
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
            using var client = _httpClient.CreateClient();

            var json = await client.GetStringAsync("http://open.iciba.com/dsapi/");
            var obj = JObject.Parse(json);
            var note = obj["note"].ToString();
            var content = obj["content"].ToString();

            var _ttsClient = new Tts(AppSettings.BaiduAI.APIKey, AppSettings.BaiduAI.SecretKey) { Timeout = 60000 };

            // https://ai.baidu.com/docs#/TTS-Online-Csharp-SDK/d27a4e02
            var option = new Dictionary<string, object>()
            {
                {"spd", 5}, // 语速，取值0-9，默认为5中语速
                {"vol", 7}, // 音量，取值0-15，默认为5中音量
                {"per", 4}  // 发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫
            };

            var result = _ttsClient.Synthesis(string.Format(GlobalConsts.GreetWord, note, content), option);

            if (result.Success)
            {
                return File(result.Data, "audio/mpeg");
            }
            else
            {
                var ttsBytes = await client.GetByteArrayAsync(obj["tts"].ToString());
                return File(ttsBytes, "audio/mpeg");
            }
        }

        /// <summary>
        /// 根据IP获取所在区域
        /// </summary>
        /// <param name="ip"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("ip2region")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "ip" })]
        public async Task<Response<string>> Ip2Region([RegularExpression(@"\d{0,3}\.\d{0,3}\.\d{0,3}\.\d{0,3}", ErrorMessage = "ip格式有误")] string ip)
        {
            var response = new Response<string>();

            if (string.IsNullOrEmpty(ip))
            {
                ip = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
                if (string.IsNullOrEmpty(ip)) ip = Request.HttpContext.Connection.RemoteIpAddress.MapToIPv4().ToString();
            }

            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/ip2region.db");

            using var _search = new DbSearcher(path);
            var result = (await _search.BinarySearchAsync(ip)).Region;

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 智能抠图，移除图片背景 - 通过 Image File
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("removebg")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> RemoveBg(IFormFile file)
        {
            var suffix = new List<string>() { ".jpg", ".png" };

            var fileSuffix = Path.GetExtension(file.FileName).ToLower();

            if (file.Length <= 0 || !suffix.Contains(fileSuffix))
                throw new Exception("上传的图片有问题");

            var fileName = Path.GetRandomFileName() + fileSuffix;
            var filePath = Path.GetTempPath() + fileName;
            using var stream = System.IO.File.Create(filePath);
            await file.CopyToAsync(stream);
            stream.Close();

            using var client = _httpClient.CreateClient();
            using var formData = new MultipartFormDataContent();
            formData.Headers.Add("X-Api-Key", AppSettings.RemoveBg.Secret);
            formData.Add(new ByteArrayContent(System.IO.File.ReadAllBytes(filePath)), "image_file", fileName);
            formData.Add(new StringContent("auto"), "size");

            var response = await client.PostAsync(AppSettings.RemoveBg.URL, formData);
            if (response.IsSuccessStatusCode)
            {
                var bytes = await response.Content.ReadAsByteArrayAsync();
                return File(bytes, "image/png");
            }
            else
            {
                throw new Exception(await response.Content.ReadAsStringAsync());
            }
        }

        /// <summary>
        /// 智能抠图，移除图片背景 - 通过 Image URL
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("removebg")]
        public async Task<IActionResult> RemoveBg(string url)
        {
            using var client = new HttpClient();
            using var formData = new MultipartFormDataContent();
            formData.Headers.Add("X-Api-Key", AppSettings.RemoveBg.Secret);
            formData.Add(new StringContent(url), "image_url");
            formData.Add(new StringContent("auto"), "size");

            var response = client.PostAsync(AppSettings.RemoveBg.URL, formData).Result;
            if (response.IsSuccessStatusCode)
            {
                var bytes = await response.Content.ReadAsByteArrayAsync();
                return File(bytes, "image/png");
            }
            else
            {
                throw new Exception(await response.Content.ReadAsStringAsync());
            }
        }

        /// <summary>
        /// 查询CDN刷新历史
        /// </summary>
        /// <param name="startTime"></param>
        /// <param name="endTime"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("cdn")]
        public async Task<Response<DescribePurgeTasksResponse>> QueryCdnRefresh(DateTime? startTime = null, DateTime? endTime = null)
        {
            var response = new Response<DescribePurgeTasksResponse>();

            if (!startTime.HasValue || !endTime.HasValue)
            {
                endTime = DateTime.Now;
                startTime = endTime.Value.AddDays(-30);
            }

            var format = "yyyy-MM-dd HH:mm:ss";
            var dic = new Dictionary<string, string>()
            {
                { "StartTime", startTime?.ToString(format)},
                { "EndTime", endTime?.ToString(format) }
            };

            DoCdnAction(out CdnClient client, out DescribePurgeTasksRequest req, dic.SerializeToJson());

            var resp = await client.DescribePurgeTasks(req);
            response.Result = resp;

            return response;
        }

        /// <summary>
        /// CDN刷新
        /// </summary>
        /// <param name="urls"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("cdn/refresh")]
        public async Task<Response<string>> CdnRefresh(List<string> urls)
        {
            var response = new Response<string>();

            var dic = new Dictionary<string, List<string>> { { "Urls", urls } };
            DoCdnAction(out CdnClient client, out PurgeUrlsCacheRequest req, dic.SerializeToJson());
            var resp = await client.PurgeUrlsCache(req);
            response.Result = AbstractModel.ToJsonString(resp);

            return response;
        }

        /// <summary>
        /// DoCdnAction
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="client"></param>
        /// <param name="req"></param>
        /// <param name="json"></param>
        private static void DoCdnAction<T>(out CdnClient client, out T req, string json)
        {
            var cred = new Credential
            {
                SecretId = AppSettings.TencentCloud.SecretId,
                SecretKey = AppSettings.TencentCloud.SecretKey
            };

            var httpProfile = new HttpProfile { Endpoint = "cdn.tencentcloudapi.com" };
            var clientProfile = new ClientProfile { HttpProfile = httpProfile };

            client = new CdnClient(cred, "", clientProfile);
            req = AbstractModel.FromJsonString<T>(json);
        }
    }
}
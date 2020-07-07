using Baidu.Aip.Speech;
using IP2Region;
using Meowv.Blog.Application.Caching.Common;
using Meowv.Blog.Application.Contracts.Common;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Volo.Abp;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Common.Impl
{
    public class CommonService : ServiceBase, ICommonService
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly ICommonCacheService _commonCacheService;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public CommonService(IHttpClientFactory httpClient,
                             ICommonCacheService commonCacheService,
                             IHttpContextAccessor httpContextAccessor)
        {
            _httpClient = httpClient;
            _commonCacheService = commonCacheService;
            _httpContextAccessor = httpContextAccessor;
        }

        /// <summary>
        /// 获取必应每日壁纸，返回图片URL
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetBingImgUrlAsync()
        {
            return await _commonCacheService.GetBingImgUrlAsync(async () =>
            {
                var result = new ServiceResult<string>();

                var api = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&pid=hp&FORM=BEHPTB";

                using var client = _httpClient.CreateClient();
                var json = await client.GetStringAsync(api);

                var obj = JObject.Parse(json);
                var url = $"https://cn.bing.com{obj["images"].First()["url"]}";

                result.IsSuccess(url);
                return result;
            });
        }

        /// <summary>
        /// 获取必应每日壁纸，直接返回图片
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> GetBingImgFileAsync()
        {
            return await _commonCacheService.GetBingImgFileAsync(async () =>
            {
                var result = new ServiceResult<byte[]>();

                var url = (await GetBingImgUrlAsync()).Result;

                using var client = _httpClient.CreateClient();
                var bytes = await client.GetByteArrayAsync(url);

                result.IsSuccess(bytes);
                return result;
            });
        }

        /// <summary>
        /// 获取妹子图，返回URL列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<string>>> GetGirlsAsync()
        {
            return await _commonCacheService.GetGirlsAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<string>>();

                var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/girls.json");
                var girls = await path.FromJsonFile<List<string>>("girls");

                result.IsSuccess(girls);
                return result;
            });
        }

        /// <summary>
        /// 获取一张妹子图，返回图片URL
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetGirlImgUrlAsync()
        {
            var result = new ServiceResult<string>();

            var girls = (await GetGirlsAsync()).Result;
            var url = girls.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            result.IsSuccess(url);
            return result;
        }

        /// <summary>
        /// 获取一张妹子图，直接返回图片
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> GetGirlImgFileAsync()
        {
            var result = new ServiceResult<byte[]>();

            var url = (await GetGirlImgUrlAsync()).Result;

            return await _commonCacheService.GetGirlImgFileAsync(url, async () =>
            {
                using var client = _httpClient.CreateClient();
                var bytes = await client.GetByteArrayAsync(url);

                result.IsSuccess(bytes);
                return result;
            });
        }

        /// <summary>
        /// 获取猫图，返回URL列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<string>>> GetCatsAsync()
        {
            return await _commonCacheService.GetCatsAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<string>>();

                var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/cats.json");
                var girls = await path.FromJsonFile<List<string>>("cats");

                result.IsSuccess(girls);
                return result;
            });
        }

        /// <summary>
        /// 获取猫图，返回图片URL
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetCatImgUrlAsync()
        {
            var result = new ServiceResult<string>();

            var girls = (await GetCatsAsync()).Result;
            var url = girls.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            result.IsSuccess(url);
            return result;
        }

        /// <summary>
        /// 获取猫图，直接返回图片
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> GetCatImgFileAsync()
        {
            var result = new ServiceResult<byte[]>();

            var url = (await GetCatImgUrlAsync()).Result;

            return await _commonCacheService.GetCatImgFileAsync(url, async () =>
            {
                using var client = _httpClient.CreateClient();
                var bytes = await client.GetByteArrayAsync(url);

                result.IsSuccess(bytes);
                return result;
            });
        }

        /// <summary>
        /// 根据IP地址获取所在区域
        /// </summary>
        /// <param name="ip"></param>
        /// <returns></returns>
        public async Task<ServiceResult<List<string>>> Ip2ReginAsync(string ip)
        {
            var result = new ServiceResult<List<string>>();

            if (string.IsNullOrEmpty(ip))
            {
                ip = _httpContextAccessor.HttpContext.Request.GetClientIp();
            }

            if (!ip.IsIp())
            {
                result.IsFailed(ResponseText.IP_IS_WRONG);
                return result;
            }

            return await _commonCacheService.Ip2ReginAsync(ip, async () =>
            {
                var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/ip2region.db");

                using var _search = new DbSearcher(path);
                var block = await _search.BinarySearchAsync(ip);

                var region = block.Region.Split("|").Distinct().Where(x => x != "0").ToList();

                region.AddFirst(ip);

                result.IsSuccess(region);
                return result;
            });
        }

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> RemoveBgAsync(IFormFile file)
        {
            var result = new ServiceResult<byte[]>();

            if (file.Length <= 0 || !file.FileName.IsImgFileName())
            {
                result.IsFailed(ResponseText.IMG_IS_WRONG);
                return result;
            }

            var fileName = Path.GetRandomFileName() + Path.GetExtension(file.FileName);
            var filePath = Path.GetTempPath() + fileName;

            using (var stream = File.Create(filePath))
            {
                await file.CopyToAsync(stream);
            }

            using var client = _httpClient.CreateClient();
            using var formData = new MultipartFormDataContent();
            formData.Headers.Add("X-Api-Key", AppSettings.RemoveBg.Secret);
            formData.Add(new ByteArrayContent(File.ReadAllBytes(filePath)), "image_file", fileName);
            formData.Add(new StringContent("auto"), "size");

            var response = await client.PostAsync(AppSettings.RemoveBg.URL, formData);
            if (response.IsSuccessStatusCode)
                result.IsSuccess(await response.Content.ReadAsByteArrayAsync());
            else
                result.IsFailed(await response.Content.ReadAsStringAsync());

            return result;
        }

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> RemoveBgAsync(string url)
        {
            var result = new ServiceResult<byte[]>();

            using var client = new HttpClient();
            using var formData = new MultipartFormDataContent();
            formData.Headers.Add("X-Api-Key", AppSettings.RemoveBg.Secret);
            formData.Add(new StringContent(url), "image_url");
            formData.Add(new StringContent("auto"), "size");

            var response = await client.PostAsync(AppSettings.RemoveBg.URL, formData);
            if (response.IsSuccessStatusCode)
                result.IsSuccess(await response.Content.ReadAsByteArrayAsync());
            else
                result.IsFailed(await response.Content.ReadAsStringAsync());

            return result;
        }

        /// <summary>
        /// 语音合成
        /// </summary>
        /// <param name="content">合成的文本，长度在1024字节以内</param>
        /// <param name="spd">语速，取值0-9，默认为5中语速</param>
        /// <param name="pit">音调，取值0-9，默认为5中语调</param>
        /// <param name="vol">音量，取值0-15，默认为5中音量</param>
        /// <param name="per">发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫</param>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> SpeechTtsAsync(string content, int spd, int pit, int vol, int per)
        {
            return await _commonCacheService.SpeechTtsAsync(content, spd, pit, vol, per, async () =>
            {
                var result = new ServiceResult<byte[]>();

                var option = new Dictionary<string, object>()
                {
                    { "spd", spd },
                    { "pit", pit },
                    { "vol", vol },
                    { "per", per }
                };

                var _ttsClient = new Tts(AppSettings.BaiduAI.APIKey, AppSettings.BaiduAI.SecretKey)
                {
                    Timeout = 60000
                };

                var response = _ttsClient.Synthesis(content, option);

                if (response.Success)
                    result.IsSuccess(response.Data);
                else
                    result.IsFailed(response.ErrorMsg);

                return await Task.FromResult(result);
            });
        }

        /// <summary>
        /// 语音合成欢迎词
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> SpeechTtsGreetWordAsync()
        {
            return await _commonCacheService.SpeechTtsGreetWordAsync(async () =>
            {
                var result = new ServiceResult<byte[]>();

                using var client = _httpClient.CreateClient();
                var json = await client.GetStringAsync("http://open.iciba.com/dsapi/");
                var obj = JObject.Parse(json);
                var note = obj["note"].ToString();
                var content = obj["content"].ToString();

                var _ttsClient = new Tts(AppSettings.BaiduAI.APIKey, AppSettings.BaiduAI.SecretKey)
                {
                    Timeout = 60000
                };

                // https://ai.baidu.com/ai-doc/SPEECH/
                var option = new Dictionary<string, object>()
                {
                    { "spd", 5 }, // 语速，取值0-9，默认为5中语速
                    { "pit", 5 }, // 音调，取值0-9，默认为5中语调
                    { "vol", 7 }, // 音量，取值0-15，默认为5中音量
                    { "per", 4 }  // 发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫
                };

                var response = _ttsClient.Synthesis(GreetWord.FormatWith(note, content), option);

                if (response.Success)
                    result.IsSuccess(response.Data);
                else
                {
                    var bytes = await client.GetByteArrayAsync(obj["tts"].ToString());
                    result.IsSuccess(bytes);
                }
                return result;
            });
        }

        /// <summary>
        /// 根据条件查询 Emoji 表情列表
        /// </summary>
        /// <param name="category"></param>
        /// <param name="keyword"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EmojiDto>>> QueryEmojisAsync(string category, string keyword)
        {
            var result = new ServiceResult<IEnumerable<EmojiDto>>();

            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/emojis.json");
            var emoji_json = await path.FromJsonFile<dynamic>();

            var emojis = new List<NameValue<EmojiJsonDto>>();

            JObject jObject = new JObject(emoji_json);
            foreach (var item in jObject)
            {
                var name = item.Key;
                var value = item.Value.ToObject<EmojiJsonDto>();

                emojis.Add(new NameValue<EmojiJsonDto>
                {
                    Name = name,
                    Value = value
                });
            }

            var list = emojis.WhereIf(category.IsNotNullOrEmpty(), x => x.Value.Category == category)
                             .WhereIf(keyword.IsNotNullOrEmpty(), x => x.Value.Keywords.Contains(keyword))
                             .Select(x => new EmojiDto
                             {
                                 Name = x.Name,
                                 Char = x.Value.Char,
                                 Category = x.Value.Category,
                                 Keywords = x.Value.Keywords
                             }).ToList();

            result.IsSuccess(list);
            return result;
        }

        /// <summary>
        /// 返回图片
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> ReturnImgAsync(string url)
        {
            var result = new ServiceResult<byte[]>();

            using var client = _httpClient.CreateClient();
            var bytes = await client.GetByteArrayAsync(url);

            result.IsSuccess(bytes);
            return result;
        }
    }
}
using Meowv.Blog.Application.Caching.Common;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Common.Impl
{
    public class CommonService : ServiceBase, ICommonService
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly ICommonCacheService _commonCacheService;

        public CommonService(IHttpClientFactory httpClient,
                             ICommonCacheService commonCacheService)
        {
            _httpClient = httpClient;
            _commonCacheService = commonCacheService;
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
    }
}
using IP2Region;
using Meowv.Blog.Application.Caching.Common;
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
        public async Task<ServiceResult<string>> Ip2ReginAsync(string ip)
        {
            var result = new ServiceResult<string>();

            if (string.IsNullOrEmpty(ip))
            {
                ip = _httpContextAccessor.HttpContext.Request.GetClientIp();
            }

            if (!ip.IsIp())
            {
                result.IsFailed("IP地址格式不正确");
                return result;
            }

            var path = Path.Combine(Directory.GetCurrentDirectory(), "Resources/ip2region.db");

            using var _search = new DbSearcher(path);
            var block = await _search.BinarySearchAsync(ip);

            result.IsSuccess(block.Region);
            return result;
        }
    }
}
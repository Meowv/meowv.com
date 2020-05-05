using Meowv.Blog.ToolKits.Base;
using Newtonsoft.Json.Linq;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Common.Impl
{
    public class CommonService : ServiceBase, ICommonService
    {
        private readonly IHttpClientFactory _httpClient;

        public CommonService(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// 获取必应每日壁纸，返回图片URL
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetBingImgUrlAsync()
        {
            var result = new ServiceResult<string>();

            var api = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&pid=hp&FORM=BEHPTB";

            using var client = _httpClient.CreateClient();
            var json = await client.GetStringAsync(api);

            var obj = JObject.Parse(json);
            var url = $"https://cn.bing.com{obj["images"].First()["url"]}";

            result.IsSuccess(url);
            return result;
        }

        /// <summary>
        /// 获取必应每日壁纸，直接返回图片
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> GetBingImgFileAsync()
        {
            var result = new ServiceResult<byte[]>();

            var url = (await GetBingImgUrlAsync()).Result;

            using var client = _httpClient.CreateClient();
            var bytes = await client.GetByteArrayAsync(url);

            result.IsSuccess(bytes);
            return result;
        }
    }
}
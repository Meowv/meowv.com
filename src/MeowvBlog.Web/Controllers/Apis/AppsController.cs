using MeowvBlog.Core.Configuration;
using MeowvBlog.Weixin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Plus;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class AppsController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;

        public AppsController(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// 微信分享签名接口
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("weixin_sign")]
        public async Task<WeixinResponse> WeixinSign(string url)
        {
            var response = new WeixinResponse();

            if (url.IsNullOrEmpty())
            {
                response.Message = "未提供URL";
                return response;
            }

            response = await url.WeixinSignResponse();
            return response;
        }

        /// <summary>
        /// VIP视频解析URL接口
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("vip_urls")]
        public List<NameValue<string>> VipUrls()
        {
            var result = new List<NameValue<string>>();

            var names = "①/②/③/④/⑤/⑥/⑦/⑧/⑨/⑩";

            var urls = AppSettings.VipUrls;

            for (int i = 0; i < urls.Count; i++)
            {
                result.Add(new NameValue<string>
                {
                    Name = $"{names.Split("/")[i]}全网通用VIP视频解析接口",
                    Value = urls[i]
                });
            }

            return result;
        }

        /// <summary>
        /// 获取bing每日壁纸
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("bing")]
        public async Task<IActionResult> GetBingAsync()
        {
            var api = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&pid=hp&FORM=BEHPTB";

            using (var client = _httpClientFactory.CreateClient())
            {
                var json = await client.GetStringAsync(api);

                var obj = JObject.Parse(json);

                var url = "https://cn.bing.com" + obj["images"][0]["url"].ToString();

                var bytes = await client.GetByteArrayAsync(url);

                return File(bytes, "image/jpeg");
            }
        }

        /// <summary>
        /// 获取随机一张猫咪图
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("cat")]
        public async Task<IActionResult> GetCatAsync()
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), @"Resources/cats.json");

            var cats = await path.GetObjectFromJsonFile<List<string>>("cats");

            var url = cats.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            using (var client = _httpClientFactory.CreateClient())
            {
                var bytes = await client.GetByteArrayAsync(url);

                return File(bytes, "image/jpeg");
            }
        }
    }
}
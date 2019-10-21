using MeowvBlog.API.Extensions;
using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Weixin;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Senparc.Weixin.MP.Containers;
using Senparc.Weixin.MP.Helpers;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class CommonController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;

        public CommonController(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// 微信分享验证
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("weixin_sign")]
        public async Task<Response<WeixinSignatureDto>> GetWeixinSignatureAsync(string url)
        {
            var response = new Response<WeixinSignatureDto>();

            if (string.IsNullOrEmpty(url))
            {
                response.Msg = "未提供URL";
                return response;
            }

            var ticket = await JsApiTicketContainer.TryGetJsApiTicketAsync(AppSettings.Weixin.AppId, AppSettings.Weixin.AppSecret);
            if (string.IsNullOrEmpty(ticket))
            {
                response.Msg = "获取Ticket出错";
                return response;
            }
            var noncestr = JSSDKHelper.GetNoncestr();
            var timestamp = JSSDKHelper.GetTimestamp();
            var signature = JSSDKHelper.GetSignature(ticket, noncestr, timestamp, url);

            var result = new WeixinSignatureDto
            {
                Timestamp = timestamp,
                Noncestr = noncestr,
                Ticket = ticket,
                Signature = signature
            };

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 必应每日壁纸
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("bing")]
        public async Task<IActionResult> GetBingAsync()
        {
            var api = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&pid=hp&FORM=BEHPTB";

            using var client = _httpClient.CreateClient();
            var json = await client.GetStringAsync(api);
            var obj = JObject.Parse(json);
            var url = "https://cn.bing.com" + obj["images"][0]["url"].ToString();
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
            var path = Path.Combine(Directory.GetCurrentDirectory(), @"Resources/cats.json");

            var cats = await path.GetObjFromJsonFile<List<string>>("cats");

            var url = cats.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            using var client = _httpClient.CreateClient();
            var bytes = await client.GetByteArrayAsync(url);

            return File(bytes, "image/jpeg");
        }
    }
}
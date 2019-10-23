using MeowvBlog.API.Extensions;
using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Domain.HotNews;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.HotNews;
using MeowvBlog.Core.Dto.Weixin;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;
using Senparc.Weixin.MP.Containers;
using Senparc.Weixin.MP.Helpers;
using System;
using System.Collections.Generic;
using System.ComponentModel;
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
        public async Task<Response<IList<HotNewsSourceDto>>> GetHotNewsSourceAsync()
        {
            var response = new Response<IList<HotNewsSourceDto>>();

            var result = new List<HotNewsSourceDto>();
            foreach (var item in Enum.GetValues(typeof(HotNewsSource)))
            {
                var dto = new HotNewsSourceDto
                {
                    Key = item.ToString(),
                    Value = Convert.ToInt32(item)
                };

                var objArray = item.GetType().GetField(item.ToString()).GetCustomAttributes(typeof(DescriptionAttribute), true);
                if (objArray.Any()) dto.Description = (objArray.First() as DescriptionAttribute).Description;

                result.Add(dto);
            }

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
        /// 微信分享验证
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("weixin_sign")]
        [ResponseCache(CacheProfileName = "default")]
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
            var path = Path.Combine(Directory.GetCurrentDirectory(), @"Resources/cats.json");

            var cats = await path.GetObjFromJsonFile<List<string>>("cats");

            var url = cats.OrderBy(x => Guid.NewGuid()).Take(1).FirstOrDefault();

            using var client = _httpClient.CreateClient();
            var bytes = await client.GetByteArrayAsync(url);

            return File(bytes, "image/jpeg");
        }
    }
}
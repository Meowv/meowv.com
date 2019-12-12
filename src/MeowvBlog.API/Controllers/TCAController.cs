using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Models.Dto.Response;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TencentCloud.Captcha.V20190722;
using TencentCloud.Captcha.V20190722.Models;
using TencentCloud.Cdn.V20180606;
using TencentCloud.Cdn.V20180606.Models;
using TencentCloud.Common;
using TencentCloud.Common.Profile;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class TCAController : ControllerBase
    {
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

            var parameters = new
            {
                StartTime = startTime?.ToDateTime(),
                EndTime = endTime?.ToDateTime()
            };
            DoCdnAction(out CdnClient client, out DescribePurgeTasksRequest req, parameters.SerializeToJson());

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

            var parameters = new { Urls = urls };
            DoCdnAction(out CdnClient client, out PurgeUrlsCacheRequest req, parameters.SerializeToJson());

            var resp = await client.PurgeUrlsCache(req);
            response.Result = AbstractModel.ToJsonString(resp);

            return response;
        }

        /// <summary>
        /// 验证码校验
        /// </summary>
        /// <param name="ticket"></param>
        /// <param name="randstr"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("captcha")]
        public async Task<Response<DescribeCaptchaResultResponse>> Captcha(string ticket, string randstr)
        {
            var response = new Response<DescribeCaptchaResultResponse>();

            var ip = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (string.IsNullOrEmpty(ip)) ip = Request.HttpContext.Connection.RemoteIpAddress.MapToIPv4().ToString();

            var parameters = new
            {
                CaptchaType = "9",
                UserIp = ip,
                Ticket = ticket,
                Randstr = randstr,
                CaptchaAppId = AppSettings.TencentCloud.Captcha.APIKey,
                AppSecretKey = AppSettings.TencentCloud.Captcha.SecretKey,
            };
            DoTencentCloudAction("captcha", out Credential cred, out ClientProfile clientProfile);

            var client = new CaptchaClient(cred, "", clientProfile);
            var req = AbstractModel.FromJsonString<DescribeCaptchaResultRequest>(parameters.SerializeToJson());
            var resp = await client.DescribeCaptchaResult(req);

            if (resp.CaptchaCode != 1)
                response.Msg = resp.CaptchaMsg;
            else
                response.Result = resp;

            return response;
        }

        /// <summary>
        /// DoTencentCloudAction
        /// </summary>
        /// <param name="endpoint"></param>
        /// <param name="cred"></param>
        /// <param name="clientProfile"></param>
        private static void DoTencentCloudAction(string endpoint, out Credential cred, out ClientProfile clientProfile)
        {
            cred = new Credential
            {
                SecretId = AppSettings.TencentCloud.SecretId,
                SecretKey = AppSettings.TencentCloud.SecretKey
            };

            var httpProfile = new HttpProfile { Endpoint = $"{endpoint}.tencentcloudapi.com" };
            clientProfile = new ClientProfile { HttpProfile = httpProfile };
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
            DoTencentCloudAction("cdn", out Credential cred, out ClientProfile clientProfile);

            client = new CdnClient(cred, "", clientProfile);
            req = AbstractModel.FromJsonString<T>(json);
        }
    }
}
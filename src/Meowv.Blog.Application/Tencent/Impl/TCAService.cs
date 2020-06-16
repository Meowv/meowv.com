using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TencentCloud.Captcha.V20190722;
using TencentCloud.Captcha.V20190722.Models;
using TencentCloud.Cdn.V20180606;
using TencentCloud.Cdn.V20180606.Models;
using TencentCloud.Common;
using TencentCloud.Common.Profile;

namespace Meowv.Blog.Application.Tencent.Impl
{
    public class TCAService : ServiceBase, ITCAService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public TCAService(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        /// <summary>
        /// 查询CDN刷新历史
        /// </summary>
        /// <param name="startTime"></param>
        /// <param name="endTime"></param>
        /// <returns></returns>
        public async Task<ServiceResult<DescribePurgeTasksResponse>> QueryCdnRefreshHistoryAsync(DateTime? startTime = null, DateTime? endTime = null)
        {
            var result = new ServiceResult<DescribePurgeTasksResponse>();

            if (!startTime.HasValue || !endTime.HasValue)
            {
                endTime = DateTime.Now;
                startTime = endTime.Value.AddDays(-30);
            }

            var parameters = new
            {
                StartTime = startTime?.TryToDateTime("yyyy-MM-dd HH:mm:ss"),
                EndTime = endTime?.TryToDateTime("yyyy-MM-dd HH:mm:ss")
            };
            DoCdnAction(out CdnClient client, out DescribePurgeTasksRequest req, parameters.ToJson());

            var resp = await client.DescribePurgeTasks(req);

            result.IsSuccess(resp);
            return result;
        }

        /// <summary>
        /// CDN刷新
        /// </summary>
        /// <param name="urls"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> CdnRefreshAsync(IEnumerable<string> urls)
        {
            var result = new ServiceResult<string>();

            var parameters = new { Urls = urls };
            DoCdnAction(out CdnClient client, out PurgeUrlsCacheRequest req, parameters.ToJson());

            var resp = await client.PurgeUrlsCache(req);

            result.IsSuccess(AbstractModel.ToJsonString(resp));
            return result;
        }

        /// <summary>
        /// 验证码校验
        /// </summary>
        /// <param name="ticket"></param>
        /// <param name="randstr"></param>
        /// <returns></returns>
        public async Task<ServiceResult<DescribeCaptchaResultResponse>> CaptchaAsync(string ticket, string randstr)
        {
            var result = new ServiceResult<DescribeCaptchaResultResponse>();

            var ip = _httpContextAccessor.HttpContext.Request.GetClientIp();

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
            var req = AbstractModel.FromJsonString<DescribeCaptchaResultRequest>(parameters.ToJson());

            var resp = await client.DescribeCaptchaResult(req);

            if (resp.CaptchaCode != 1)
                result.IsFailed(resp.CaptchaMsg);
            else
                result.IsSuccess(resp);

            return result;
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
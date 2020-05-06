using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TencentCloud.Captcha.V20190722.Models;
using TencentCloud.Cdn.V20180606.Models;

namespace Meowv.Blog.Application.Tencent
{
    public interface ITCAService
    {
        /// <summary>
        /// 查询CDN刷新历史
        /// </summary>
        /// <param name="startTime"></param>
        /// <param name="endTime"></param>
        /// <returns></returns>
        Task<ServiceResult<DescribePurgeTasksResponse>> QueryCdnRefreshHistoryAsync(DateTime? startTime = null, DateTime? endTime = null);

        /// <summary>
        /// CDN刷新
        /// </summary>
        /// <param name="urls"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> CdnRefreshAsync(IEnumerable<string> urls);

        /// <summary>
        /// 验证码校验
        /// </summary>
        /// <param name="ticket"></param>
        /// <param name="randstr"></param>
        /// <returns></returns>
        Task<ServiceResult<DescribeCaptchaResultResponse>> CaptchaAsync(string ticket, string randstr);
    }
}
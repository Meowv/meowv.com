using Meowv.Blog.Application.Tencent;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TencentCloud.Captcha.V20190722.Models;
using TencentCloud.Cdn.V20180606.Models;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class TCAController : AbpController
    {
        private readonly ITCAService _tcaService;

        public TCAController(ITCAService tcaService)
        {
            _tcaService = tcaService;
        }

        /// <summary>
        /// 查询CDN刷新历史
        /// </summary>
        /// <param name="startTime"></param>
        /// <param name="endTime"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("cdn")]
        public async Task<ServiceResult<DescribePurgeTasksResponse>> QueryCdnRefreshHistoryAsync(DateTime? startTime = null, DateTime? endTime = null)
        {
            return await _tcaService.QueryCdnRefreshHistoryAsync(startTime, endTime);
        }

        /// <summary>
        /// CDN刷新
        /// </summary>
        /// <param name="urls"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("cdn")]
        public async Task<ServiceResult<string>> CdnRefreshAsync(IEnumerable<string> urls)
        {
            return await _tcaService.CdnRefreshAsync(urls);
        }

        /// <summary>
        /// 验证码校验
        /// </summary>
        /// <param name="ticket"></param>
        /// <param name="randstr"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("captcha")]
        public async Task<ServiceResult<DescribeCaptchaResultResponse>> CaptchaAsync(string ticket, string randstr)
        {
            return await _tcaService.CaptchaAsync(ticket, randstr);
        }
    }
}
using Meowv.Blog.Application.Contracts.HotNews;
using Meowv.Blog.Application.HotNews;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class HotNewsController : AbpController
    {
        private readonly IHotNewsService _hotNewsService;

        public HotNewsController(IHotNewsService hotNewsService)
        {
            _hotNewsService = hotNewsService;
        }

        /// <summary>
        /// 获取每日热点来源列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("sources")]
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetHotNewsSourceAsync()
        {
            return await _hotNewsService.GetHotNewsSourceAsync();
        }

        /// <summary>
        /// 根据来源获取每日热点列表
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<ServiceResult<IEnumerable<HotNewsDto>>> QueryHotNewsAsync([Required] int sourceId)
        {
            return await _hotNewsService.QueryHotNewsAsync(sourceId);
        }
    }
}
using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.Application.FM;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class FMController : AbpController
    {
        private readonly IFMService _fmService;

        public FMController(IFMService fmService)
        {
            _fmService = fmService;
        }

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("channels")]
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync()
        {
            return await _fmService.GetChannelsAsync();
        }
    }
}
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
        /// <param name="specific"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("channels")]
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(string specific)
        {
            return await _fmService.GetChannelsAsync(specific);
        }

        /// <summary>
        /// 根据专辑分类获取随机歌曲
        /// </summary>
        /// <param name="channelId"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetFmAsync(int channelId)
        {
            return await _fmService.GetFmAsync(channelId);
        }
    }
}
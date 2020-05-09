using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.Application.FM;
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

        /// <summary>
        /// 根据专辑分类获取随机歌曲
        /// </summary>
        /// <param name="channelId"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetFmAsync([Required] int channelId)
        {
            return await _fmService.GetFmAsync(channelId);
        }

        /// <summary>
        /// 获取随机歌曲
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("random")]
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetRandomFmAsync()
        {
            return await _fmService.GetRandomFmAsync();
        }

        /// <summary>
        /// 获取歌词
        /// </summary>
        /// <param name="sid"></param>
        /// <param name="ssid"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("lyric")]
        public async Task<ServiceResult<string>> GetLyricAsync(string sid, string ssid)
        {
            return await _fmService.GetLyricAsync(sid, ssid);
        }
    }
}
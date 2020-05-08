using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.FM.Impl
{
    public class FMCacheService : CachingServiceBase, IFMCacheService
    {
        private const string KEY_GetChannels = "FM:GetChannels-{0}";

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <param name="specific"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(string specific, Func<Task<ServiceResult<IEnumerable<ChannelDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetChannels.FormatWith(specific), factory, specific == "all" ? CacheStrategy.ONE_HOURS : CacheStrategy.ONE_MINUTE);
        }
    }
}
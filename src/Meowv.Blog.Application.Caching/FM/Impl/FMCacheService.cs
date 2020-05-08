using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.FM.Impl
{
    public class FMCacheService : CachingServiceBase, IFMCacheService
    {
        private const string KEY_GetChannels = "FM:GetChannels";

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(Func<Task<ServiceResult<IEnumerable<ChannelDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetChannels, factory, CacheStrategy.ONE_MINUTE);
        }
    }
}
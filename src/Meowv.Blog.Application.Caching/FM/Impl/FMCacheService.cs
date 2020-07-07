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
        private const string KEY_GetChannels = "FM:GetChannels";
        private const string KEY_GetRandomFm = "FM:KEY_GetRandomFm";
        private const string KEY_GetGeyLyric = "FM:GetGeyLyric-{0}-{1}";

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(Func<Task<ServiceResult<IEnumerable<ChannelDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetChannels, factory, CacheStrategy.HALF_HOURS);
        }

        /// <summary>
        /// 获取随机歌曲
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetRandomFmAsync(Func<Task<ServiceResult<IEnumerable<FMDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetRandomFm, factory, CacheStrategy.HALF_HOURS);
        }

        /// <summary>
        /// 获取歌词
        /// </summary>
        /// <param name="sid"></param>
        /// <param name="ssid"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLyricAsync(string sid, string ssid, Func<Task<ServiceResult<string>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetGeyLyric.FormatWith(sid, ssid), factory, CacheStrategy.HALF_HOURS);
        }
    }
}
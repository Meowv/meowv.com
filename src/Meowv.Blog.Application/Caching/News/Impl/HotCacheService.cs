using Meowv.Blog.Dto.News.Params;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.News.Impl
{
    public class HotCacheService : CachingServiceBase, IHotCacheService
    {
        public async Task<BlogResponse<Dictionary<string, string>>> GetSourcesAsync(Func<Task<BlogResponse<Dictionary<string, string>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetSources(), func, CachingConsts.CacheStrategy.NEVER);

        public async Task<BlogResponse<HotDto>> GetHotsAsync(string source, Func<Task<BlogResponse<HotDto>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetHots(source), func, CachingConsts.CacheStrategy.ONE_HOURS);
    }
}
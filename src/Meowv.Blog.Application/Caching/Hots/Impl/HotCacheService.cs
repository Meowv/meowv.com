using Meowv.Blog.Dto.Hots;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Hots.Impl
{
    public class HotCacheService : CachingServiceBase, IHotCacheService
    {
        public async Task<BlogResponse<List<HotSourceDto>>> GetSourcesAsync(Func<Task<BlogResponse<List<HotSourceDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetSources(), func, CachingConsts.CacheStrategy.ONE_HOURS);

        public async Task<BlogResponse<HotDto>> GetHotsAsync(string id, Func<Task<BlogResponse<HotDto>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetHots(id), func, CachingConsts.CacheStrategy.ONE_HOURS);
    }
}
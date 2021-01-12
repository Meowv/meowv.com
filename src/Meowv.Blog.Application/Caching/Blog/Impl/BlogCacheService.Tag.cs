using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        public async Task<BlogResponse<List<GetTagDto>>> GetTagsAsync(Func<Task<BlogResponse<List<GetTagDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetTags(), func, CachingConsts.CacheStrategy.HALF_DAY);
    }
}
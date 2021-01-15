using Meowv.Blog.Dto.News.Params;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.News
{
    public interface IHotCacheService
    {
        /// <summary>
        /// Get the list of sources from the cache.
        /// </summary>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<Dictionary<string, string>>> GetSourcesAsync(Func<Task<BlogResponse<Dictionary<string, string>>>> func);

        /// <summary>
        /// Get the list of hot news by source from the cache.
        /// </summary>
        /// <param name="source"></param>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<HotDto>> GetHotsAsync(string source, Func<Task<BlogResponse<HotDto>>> func);
    }
}
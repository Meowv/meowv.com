using Meowv.Blog.Dto.Hots;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Hots
{
    public interface IHotCacheService : ICacheRemoveService
    {
        /// <summary>
        /// Get the list of sources from the cache.
        /// </summary>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<List<HotSourceDto>>> GetSourcesAsync(Func<Task<BlogResponse<List<HotSourceDto>>>> func);

        /// <summary>
        /// Get the list of hot news by id from the cache.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<HotDto>> GetHotsAsync(string id, Func<Task<BlogResponse<HotDto>>> func);
    }
}
using Meowv.Blog.Caching.Hots;
using Meowv.Blog.Domain.Hots;
using Meowv.Blog.Domain.Hots.Repositories;
using Meowv.Blog.Dto.Hots;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Hots.Impl
{
    public class HotService : ServiceBase, IHotService
    {
        private readonly IHotRepository _hots;
        private readonly IHotCacheService _cache;

        public HotService(IHotRepository hots, IHotCacheService cache)
        {
            _hots = hots;
            _cache = cache;
        }

        /// <summary>
        /// Get the list of sources.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/hots/source")]
        public async Task<BlogResponse<List<HotSourceDto>>> GetSourcesAsync()
        {
            return await _cache.GetSourcesAsync(async () =>
            {
                var response = new BlogResponse<List<HotSourceDto>>();

                var hots = await _hots.GetSourcesAsync();
                var result = ObjectMapper.Map<List<Hot>, List<HotSourceDto>>(hots);

                response.Result = result;
                return response;
            });
        }

        /// <summary>
        /// Get the list of hot news by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Route("api/meowv/hots/{id}")]
        public async Task<BlogResponse<HotDto>> GetHotsAsync(string id)
        {
            return await _cache.GetHotsAsync(id, async () =>
            {
                var response = new BlogResponse<HotDto>();

                var hot = await _hots.GetAsync(id.ToObjectId());
                if (hot is null)
                {
                    response.IsFailed($"The hot id not exists.");
                    return response;
                }

                var result = ObjectMapper.Map<Hot, HotDto>(hot);

                response.Result = result;
                return response;
            });
        }
    }
}
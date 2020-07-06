using Meowv.Blog.Application.Caching.HotNews;
using Meowv.Blog.Application.Contracts.HotNews;
using Meowv.Blog.Application.Contracts.HotNews.Params;
using Meowv.Blog.Domain.HotNews.Repositories;
using Meowv.Blog.Domain.Shared.Enum;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.HotNews.Impl
{
    public class HotNewsService : ServiceBase, IHotNewsService
    {
        private readonly IHotNewsCacheService _hotNewsCacheService;
        private readonly IHotNewsRepository _hotNewsRepository;

        public HotNewsService(IHotNewsCacheService hotNewsCacheService,
                              IHotNewsRepository hotNewsRepository)
        {
            _hotNewsCacheService = hotNewsCacheService;
            _hotNewsRepository = hotNewsRepository;
        }

        /// <summary>
        /// 获取每日热点来源列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetHotNewsSourceAsync()
        {
            return await _hotNewsCacheService.GetHotNewsSourceAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<EnumResponse>>();

                var types = typeof(HotNewsEnum).TryToList();
                result.IsSuccess(types);

                return await Task.FromResult(result);
            });
        }

        /// <summary>
        /// 根据来源获取每日热点列表
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<HotNewsDto>>> QueryHotNewsAsync(int sourceId)
        {
            return await _hotNewsCacheService.QueryHotNewsAsync(sourceId, async () =>
            {
                var result = new ServiceResult<IEnumerable<HotNewsDto>>();

                var hotNews = _hotNewsRepository.Where(x => x.SourceId == sourceId).ToList();

                var list = ObjectMapper.Map<IEnumerable<Domain.HotNews.HotNews>, IEnumerable<HotNewsDto>>(hotNews);
                result.IsSuccess(list);

                return await Task.FromResult(result);
            });
        }

        /// <summary>
        /// 批量插入每日热点数据
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> BulkInsertHotNewsAsync(BulkInsertHotNewsInput input)
        {
            var result = new ServiceResult<string>();

            if (!input.HotNews.Any())
            {
                result.IsFailed(ResponseText.DATA_IS_NONE);
                return result;
            }

            var hotNews = ObjectMapper.Map<IEnumerable<HotNewsDto>, IEnumerable<Domain.HotNews.HotNews>>(input.HotNews);
            foreach (var item in hotNews)
            {
                item.SourceId = (int)input.Source;
                item.CreateTime = DateTime.Now;
            }

            await _hotNewsRepository.DeleteAsync(x => x.SourceId == (int)input.Source);
            await _hotNewsRepository.BulkInsertAsync(hotNews.Reverse());

            result.IsSuccess(ResponseText.INSERT_SUCCESS);
            return result;
        }
    }
}
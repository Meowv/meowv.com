using MeowvBlog.Core.Domain.HotNews;
using MeowvBlog.Core.Domain.HotNews.Repositories;
using MeowvBlog.Services.Dto.HotNews;
using Plus;
using Plus.AutoMapper;
using Plus.CodeAnnotations;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.HotNews.Impl
{
    public class HotNewsService : ServiceBase, IHotNewsService
    {
        private readonly IHotNewsRepository _hotNewsRepository;

        public HotNewsService(IHotNewsRepository hotNewsRepository)
        {
            _hotNewsRepository = hotNewsRepository;
        }

        /// <summary>
        /// 批量添加热榜
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> BulkInsertHotNews(IList<InsertHotNewsInput> dtos)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _hotNewsRepository.DeleteAsync(x => x.SourceId == dtos.FirstOrDefault().SourceId);

                var hotNews = dtos.Select(x => new Core.Domain.HotNews.HotNews
                {
                    Id = GenerateGuid(),
                    Title = x.Title,
                    Url = x.Url,
                    SourceId = x.SourceId,
                    Time = DateTime.Now
                }).ToList();

                var result = await _hotNewsRepository.BulkInsertHotNewsAsync(hotNews);

                await uow.CompleteAsync();

                if (result)
                    output.Result = "success";
                else
                    output.AddError("新增HotNews出错了~~~");

                return output;
            }
        }

        /// <summary>
        /// 获取所有HotNews的类型
        /// </summary>
        /// <returns></returns>
        public async Task<IList<NameValue<int>>> GetSourceId()
        {
            var list = new List<NameValue<int>>();

            foreach (HotNewsSource value in Enum.GetValues(typeof(HotNewsSource)))
            {
                list.Add(new NameValue<int>() { Name = value.ToAlias(), Value = (int)value });
            }
            return await Task.FromResult(list);
        }

        /// <summary>
        /// 根据sourceId获取对于HotNews
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        public async Task<IList<HotNewsDto>> GetHotNews(int sourceId)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var query = await _hotNewsRepository.GetAllListAsync(x => x.SourceId == sourceId);

                var result = query.MapTo<IList<HotNewsDto>>();

                return result;
            }
        }
    }
}
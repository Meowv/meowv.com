using MeowvBlog.Core.Domain.HotNews;
using MeowvBlog.Services.Dto.HotNews;
using MeowvBlog.Services.Dto.TopNews;
using Plus;
using Plus.CodeAnnotations;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.HotNews.Impl
{
    public class HotNewsService : ServiceBase, IHotNewsService
    {
        /// <summary>
        /// 批量添加热榜
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertHotNews(IList<InsertTopNewsInput> dtos)
        {
            throw new NotImplementedException();
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
            throw new NotImplementedException();
        }
    }
}
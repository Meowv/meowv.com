using MeowvBlog.Services.Dto.HotNews;
using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.HotNews
{
    public interface IHotNewsService
    {
        /// <summary>
        /// 批量添加热榜
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> BulkInsertHotNews(IList<InsertHotNewsInput> dtos);

        /// <summary>
        /// 获取所有HotNews的类型
        /// </summary>
        /// <returns></returns>
        Task<IList<NameValue<int>>> GetSourceId();

        /// <summary>
        /// 根据sourceId获取对于HotNews
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        Task<IList<HotNewsDto>> GetHotNews(int sourceId);
    }
}
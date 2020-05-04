using Meowv.Blog.Application.Contracts.HotNews;
using Meowv.Blog.Application.Contracts.HotNews.Params;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.HotNews
{
    public interface IHotNewsService
    {
        /// <summary>
        /// 获取每日热点来源列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EnumResponse>>> GetHotNewsSourceAsync();

        /// <summary>
        /// 根据来源获取每日热点列表
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<HotNewsDto>>> QueryHotNewsAsync(int sourceId);

        /// <summary>
        /// 批量插入每日热点数据
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> BulkInsertHotNewsAsync(BulkInsertHotNewsInput input);
    }
}
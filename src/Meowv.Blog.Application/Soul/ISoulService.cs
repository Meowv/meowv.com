using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Soul
{
    public interface ISoulService
    {
        /// <summary>
        /// 获取鸡汤文本
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetRandomChickenSoupAsync();

        /// <summary>
        /// 批量插入鸡汤
        /// </summary>
        /// <param name="list"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> BulkInsertChickenSoupAsync(IEnumerable<string> list);
    }
}
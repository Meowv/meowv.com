using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Soul.Repositories
{
    public interface IChickenSoupRepository : IRepository<ChickenSoup, int>
    {
        /// <summary>
        /// 获取一条随机数据
        /// </summary>
        /// <returns></returns>
        Task<ChickenSoup> GetRandomAsync();

        /// <summary>
        /// 批量插入数据
        /// </summary>
        /// <param name="chickenSoups"></param>
        /// <returns></returns>
        Task BulkInsertAsync(IEnumerable<ChickenSoup> chickenSoups);
    }
}
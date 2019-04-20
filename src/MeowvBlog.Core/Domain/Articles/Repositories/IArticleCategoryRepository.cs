using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Articles.Repositories
{
    /// <summary>
    /// 文章对应分类仓储接口
    /// </summary>
    public interface IArticleCategoryRepository : IRepository<ArticleCategory, int>
    {
        /// <summary>
        /// 批量插入(只支持SqlServer)
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        Task<bool> BulkInsertForSqlServerAsync(IList<ArticleCategory> entities);

        /// <summary>
        /// 批量插入
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        Task<bool> BulkInsertAsync(IList<ArticleCategory> entities);
    }
}
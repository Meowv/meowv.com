using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Articles.Repositories
{
    /// <summary>
    /// 文章对应标签仓储接口
    /// </summary>
    public interface IArticleTagRepository : IRepository<ArticleTag, int>
    {
        /// <summary>
        /// 批量插入(只支持SqlServer)
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        Task<bool> BulkInsertForSqlServerAsync(IList<ArticleTag> entities);

        /// <summary>
        /// 批量插入
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        Task<bool> BulkInsertAsync(IList<ArticleTag> entities);
    }
}
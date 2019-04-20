using Dapper;
using EFCore.BulkExtensions;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MySql.Data.MySqlClient;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace MeowvBlog.EntityFramework.Repositories.Articles
{
    /// <summary>
    /// 文章对应标签仓储接口实现
    /// </summary>
    public class ArticleTagRepository : MeowvBlogRepositoryBase<ArticleTag>, IArticleTagRepository
    {
        public ArticleTagRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }

        /// <summary>
        /// 批量插入(只支持SqlServer)
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        public async Task<bool> BulkInsertForSqlServerAsync(IList<ArticleTag> entities)
        {
            try
            {
                await Context.BulkInsertAsync(entities);
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// 批量插入
        /// </summary>
        /// <param name="entities"></param>
        /// <returns></returns>
        public async Task<bool> BulkInsertAsync(IList<ArticleTag> entities)
        {
            try
            {
                using (IDbConnection conn = new MySqlConnection(AppSettings.MySqlConnectionString))
                {
                    var sql = $"INSERT INTO {MeowvBlogDbConsts.DbTableName.ArticleTags} (ArticleId, TagId) VALUES (@ArticleId, @TagId)";
                    return await conn.ExecuteAsync(sql, entities) > 0;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
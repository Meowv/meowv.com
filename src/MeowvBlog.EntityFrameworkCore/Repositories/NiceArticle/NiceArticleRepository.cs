using Dapper;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain.NiceArticle.Repositories;
using MySql.Data.MySqlClient;
using Plus.EntityFramework;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace MeowvBlog.EntityFrameworkCore.Repositories.NiceArticle
{
    public class NiceArticleRepository : MeowvBlogRepositoryBase<Core.Domain.NiceArticle.NiceArticle>, INiceArticleRepository
    {
        public NiceArticleRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<bool> BulkInsertNiceArticleAsync(IList<Core.Domain.NiceArticle.NiceArticle> niceArticles)
        {
            using (IDbConnection connection = new MySqlConnection(AppSettings.MySqlConnectionString))
            {
                var sql = "INSERT INTO `nice_articles`(`Title`, `Author`, `Source`, `Url`, `CategoryId`, `Time`) VALUES (@Title,@Author,@Source,@Url,@CategoryId,@Time)";
                return await connection.ExecuteAsync(sql, niceArticles) > 0;
            }
        }
    }
}
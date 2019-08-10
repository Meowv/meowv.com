using Dapper;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain.HotNews.Repositories;
using MySql.Data.MySqlClient;
using Plus.EntityFramework;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace MeowvBlog.EntityFrameworkCore.Repositories.HotNews
{
    public class HotNewsRepository : MeowvBlogRepositoryBase<Core.Domain.HotNews.HotNews>, IHotNewsRepository
    {
        public HotNewsRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<bool> BulkInsertHotNewsAsync(IList<Core.Domain.HotNews.HotNews> hotNews)
        {
            using (IDbConnection connection = new MySqlConnection(AppSettings.MySqlConnectionString))
            {
                var sql = "INSERT INTO `hot_news`(`Title`, `Url`, `SourceId`,`Time`) VALUES (@Title,@Url,@SourceId,@Time)";
                return await connection.ExecuteAsync(sql, hotNews) > 0;
            }
        }
    }
}
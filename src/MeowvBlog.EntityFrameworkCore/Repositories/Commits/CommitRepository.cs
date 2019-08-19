using Dapper;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain.Commits;
using MeowvBlog.Core.Domain.Commits.Repositories;
using MySql.Data.MySqlClient;
using Plus.EntityFramework;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace MeowvBlog.EntityFrameworkCore.Repositories.Commits
{
    public class CommitRepository : MeowvBlogRepositoryBase<Commit, string>, ICommitRepository
    {
        public CommitRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<bool> BulkInsertCommitAsync(IList<Commit> commits)
        {
            using (IDbConnection connection = new MySqlConnection(AppSettings.MySqlConnectionString))
            {
                var sql = "INSERT INTO `commits`(`Id`, `Sha`, `Message`, `Date`) VALUES (@Id,@Sha,@Message,@Date)";
                return await connection.ExecuteAsync(sql, commits) > 0;
            }
        }
    }
}
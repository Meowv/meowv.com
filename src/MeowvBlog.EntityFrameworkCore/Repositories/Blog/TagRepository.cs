using Dapper;
using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Blog.Repositories;
using MySql.Data.MySqlClient;
using Plus.EntityFramework;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace MeowvBlog.EntityFrameworkCore.Repositories.Blog
{
    public class TagRepository : MeowvBlogRepositoryBase<Tag>, ITagRepository
    {
        public TagRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<bool> BulkInsertTagsAsync(List<Tag> tags)
        {
            using (IDbConnection connection = new MySqlConnection(AppSettings.MySqlConnectionString))
            {
                var sql = "INSERT INTO `tags`(`TagName`, `DisplayName`) VALUES (@TagName, @DisplayName)";
                return await connection.ExecuteAsync(sql, tags) > 0;
            }
        }
    }
}
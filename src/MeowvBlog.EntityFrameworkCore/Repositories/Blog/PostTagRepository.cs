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
    public class PostTagRepository : MeowvBlogRepositoryBase<PostTag>, IPostTagRepository
    {
        public PostTagRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        public async Task<bool> BulkInsertPostTagsAsync(List<PostTag> postTags)
        {
            using (IDbConnection connection = new MySqlConnection(AppSettings.MySqlConnectionString))
            {
                var sql = "INSERT INTO `post_tags` (`PostId`, `TagId`) VALUES (@PostId, @TagId)";
                return await connection.ExecuteAsync(sql, postTags) > 0;
            }
        }
    }
}
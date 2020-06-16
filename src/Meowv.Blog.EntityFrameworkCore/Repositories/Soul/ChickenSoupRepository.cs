using Meowv.Blog.Domain.Shared;
using Meowv.Blog.Domain.Soul;
using Meowv.Blog.Domain.Soul.Repositories;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;
using static Meowv.Blog.Domain.Shared.MeowvBlogDbConsts;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Soul
{
    public class ChickenSoupRepository : EfCoreRepository<MeowvBlogDbContext, ChickenSoup, Guid>, IChickenSoupRepository
    {
        public ChickenSoupRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }

        /// <summary>
        /// 获取一条随机数据
        /// </summary>
        /// <returns></returns>
        public async Task<ChickenSoup> GetRandomAsync()
        {
            // TODO:不同数据库使用不同的SQL
            var sql = $"SELECT * FROM {MeowvBlogConsts.DbTablePrefix + DbTableName.ChickenSoups} ORDER BY RAND() LIMIT 1";
            return await DbContext.Set<ChickenSoup>().FromSqlRaw(sql).FirstOrDefaultAsync();
        }

        /// <summary>
        /// 批量插入数据
        /// </summary>
        /// <param name="chickenSoups"></param>
        /// <returns></returns>
        public async Task BulkInsertAsync(IEnumerable<ChickenSoup> chickenSoups)
        {
            await DbContext.Set<ChickenSoup>().AddRangeAsync(chickenSoups);
            await DbContext.SaveChangesAsync();
        }
    }
}
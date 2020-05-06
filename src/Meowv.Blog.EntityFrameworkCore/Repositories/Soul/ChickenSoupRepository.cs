using Meowv.Blog.Domain.Soul;
using Meowv.Blog.Domain.Soul.Repositories;
using System;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Soul
{
    public class ChickenSoupRepository : EfCoreRepository<MeowvBlogDbContext, ChickenSoup, Guid>, IChickenSoupRepository
    {
        public ChickenSoupRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
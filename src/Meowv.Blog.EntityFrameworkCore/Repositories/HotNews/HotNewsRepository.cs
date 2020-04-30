using Meowv.Blog.Domain.HotNews.Repositories;
using System;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.HotNews
{
    /// <summary>
    /// HotNewsRepository
    /// </summary>
    public class HotNewsRepository : EfCoreRepository<MeowvBlogDbContext, Domain.HotNews.HotNews, Guid>, IHotNewsRepository
    {
        public HotNewsRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
using MeowvBlog.Core.Domain.HotNews.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories.HotNews
{
    public class HotNewsRepository : MeowvBlogRepositoryBase<Core.Domain.HotNews.HotNews>, IHotNewsRepository
    {
        public HotNewsRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
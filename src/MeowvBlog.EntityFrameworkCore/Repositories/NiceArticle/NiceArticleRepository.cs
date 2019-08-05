using MeowvBlog.Core.Domain.NiceArticle.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories.NiceArticle
{
    public class NiceArticleRepository : MeowvBlogRepositoryBase<Core.Domain.NiceArticle.NiceArticle>, INiceArticleRepository
    {
        public NiceArticleRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Articles
{
    /// <summary>
    /// 文章仓储接口实现
    /// </summary>
    public class ArticlceRepository : MeowvBlogRepositoryBase<Article>, IArticleRepository
    {
        public ArticlceRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
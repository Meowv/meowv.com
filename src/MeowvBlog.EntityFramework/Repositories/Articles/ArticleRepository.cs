using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Articles
{
    /// <summary>
    /// 文章仓储接口实现
    /// </summary>
    public class ArticleRepository : MeowvBlogRepositoryBase<Article>, IArticleRepository
    {
        public ArticleRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
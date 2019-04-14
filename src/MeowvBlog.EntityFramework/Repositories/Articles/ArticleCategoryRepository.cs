using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Articles
{
    /// <summary>
    /// 文章对应分类仓储接口实现
    /// </summary>
    public class ArticleCategoryRepository : MeowvBlogRepositoryBase<ArticleCategory>, IArticleCategoryRepository
    {
        public ArticleCategoryRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Articles
{
    /// <summary>
    /// 文章对应标签仓储接口实现
    /// </summary>
    public class ArticleTagRepository : MeowvBlogRepositoryBase<ArticleTag>, IArticleTagRepository
    {
        public ArticleTagRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
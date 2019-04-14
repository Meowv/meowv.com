using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Articles.Repositories
{
    /// <summary>
    /// 文章对应分类仓储接口
    /// </summary>
    public interface IArticleCategoryRepository : IRepository<ArticleCategory, int> { }
}
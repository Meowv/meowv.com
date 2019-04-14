using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Repositories
{
    /// <summary>
    /// 文章仓储接口
    /// </summary>
    public interface IArticleRepository : IRepository<Article, int>
    {
    }
}
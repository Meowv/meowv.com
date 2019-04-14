using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Articles.Repositories
{
    /// <summary>
    /// 文章对应标签仓储接口
    /// </summary>
    public interface IArticleTagRepository : IRepository<ArticleTag, int> { }
}
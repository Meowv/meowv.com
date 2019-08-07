using Plus.Domain.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Core.Domain.NiceArticle.Repositories
{
    public interface INiceArticleRepository : IRepository<NiceArticle, int>
    {
        Task<bool> BulkInsertNiceArticleAsync(IList<NiceArticle> niceArticles);
    }
}
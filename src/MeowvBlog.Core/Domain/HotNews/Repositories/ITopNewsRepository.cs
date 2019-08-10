using Plus.Domain.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Core.Domain.HotNews.Repositories
{
    public interface IHotNewsRepository : IRepository<HotNews, int>
    {
        Task<bool> BulkInsertHotNewsAsync(IList<HotNews> hotNews);
    }
}
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Domain
{
    public interface IBulkRepository<TEntity> where TEntity : class
    {
        Task BulkInsertAsync(IEnumerable<TEntity> list);
    }
}
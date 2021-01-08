using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Domain.Repositories
{
    public interface IBulkRepository<TEntity> where TEntity : class
    {
        Task BulkInsertAsync(IEnumerable<TEntity> list);
    }
}
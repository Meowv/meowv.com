using Plus.Domain.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Core.Domain.Commits.Repositories
{
    public interface ICommitRepository : IRepository<Commit, string>
    {
        Task<bool> BulkInsertCommitAsync(IList<Commit> commits);
    }
}
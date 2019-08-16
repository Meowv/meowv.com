using MeowvBlog.Core.Domain.Commits;
using MeowvBlog.Core.Domain.Commits.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories.Commits
{
    public class CommitRepository : MeowvBlogRepositoryBase<Commit, string>, ICommitRepository
    {
        public CommitRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
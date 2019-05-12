using MeowvBlog.Entities;
using Microsoft.EntityFrameworkCore;

namespace MeowvBlog.EntityFramework.Repositories
{
    using MeowvBlog.IRepository;

    public class EfCoreRepositoryBase<TDbContext, TEntity> : EfCoreRepositoryBase<TDbContext, TEntity, int>, IRepository<TEntity>, IRepository<TEntity, int>, IRepository where TDbContext : DbContext where TEntity : class, IEntity<int>
    {
        public EfCoreRepositoryBase(IDbContextProvider<TDbContext> dbContextProvider)
            : base(dbContextProvider)
        {
        }
    }
}
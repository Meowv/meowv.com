using Plus.Domain.Entities;
using Plus.EntityFramework;
using Plus.EntityFramework.Repositories;

namespace MeowvBlog.EntityFrameworkCore
{
    public abstract class MeowvBlogRepositoryBase<TEntity, TPrimaryKey> : EfCoreRepositoryBase<MeowvBlogDbContext, TEntity, TPrimaryKey> where TEntity : class, IEntity<TPrimaryKey>
    {
        public MeowvBlogRepositoryBase(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }

    public abstract class MeowvBlogRepositoryBase<TEntity> : EfCoreRepositoryBase<MeowvBlogDbContext, TEntity, int> where TEntity : class, IEntity<int>, new()
    {
        public MeowvBlogRepositoryBase(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}
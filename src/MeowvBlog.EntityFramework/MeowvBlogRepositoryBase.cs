using UPrime.Domain.Entities;
using UPrime.EntityFramework.Repositories;

namespace MeowvBlog.EntityFramework
{
    public abstract class MeowvBlogRepositoryBase<TEntity, TPrimaryKey> : EfCoreRepositoryBase<MeowvBlogDbContext, TEntity, TPrimaryKey> where TEntity : class, IEntity<TPrimaryKey>
    {
        protected MeowvBlogRepositoryBase(MeowvBlogDbContextProvider dbContextProvider)
        : base(dbContextProvider)
        {
        }
    }

    public abstract class MeowvBlogRepositoryBase<TEntity> : EfCoreRepositoryBase<MeowvBlogDbContext, TEntity, int> where TEntity : class, IEntity<int>
    {
        protected MeowvBlogRepositoryBase(MeowvBlogDbContextProvider dbContextProvider)
        : base(dbContextProvider)
        {
        }
    }
}
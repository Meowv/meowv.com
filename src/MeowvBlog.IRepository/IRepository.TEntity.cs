using MeowvBlog.Entities;

namespace MeowvBlog.IRepository
{
    /// <summary>
    /// IRepository
    /// </summary>
    /// <typeparam name="TEntity"></typeparam>
    public interface IRepository<TEntity> : IRepository<TEntity, int>, IRepository where TEntity : class, IEntity<int>
    {
    }
}
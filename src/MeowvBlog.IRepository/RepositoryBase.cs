using MeowvBlog.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;

namespace MeowvBlog.IRepository
{
    /// <summary>
    /// RepositoryBase
    /// </summary>
    /// <typeparam name="TEntity"></typeparam>
    /// <typeparam name="TPrimaryKey"></typeparam>
    public abstract class RepositoryBase<TEntity, TPrimaryKey> : IRepository<TEntity, TPrimaryKey>, IRepository where TEntity : class, IEntity<TPrimaryKey>
    {
        /// <summary>
        /// GetAll
        /// </summary>
        /// <returns></returns>
        public abstract IQueryable<TEntity> GetAll();

        /// <summary>
        /// GetAllIncluding
        /// </summary>
        /// <param name="propertySelectors"></param>
        /// <returns></returns>
        public virtual IQueryable<TEntity> GetAllIncluding(params Expression<Func<TEntity, object>>[] propertySelectors)
        {
            return GetAll();
        }

        /// <summary>
        /// GetAllList
        /// </summary>
        /// <returns></returns>
        public virtual List<TEntity> GetAllList()
        {
            return GetAll().ToList();
        }

        /// <summary>
        /// GetAllListAsync
        /// </summary>
        /// <returns></returns>
        public virtual Task<List<TEntity>> GetAllListAsync()
        {
            return Task.FromResult(GetAllList());
        }

        /// <summary>
        /// GetAllList
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual List<TEntity> GetAllList(Expression<Func<TEntity, bool>> predicate)
        {
            return GetAll().Where(predicate).ToList();
        }

        /// <summary>
        /// GetAllListAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task<List<TEntity>> GetAllListAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return Task.FromResult(GetAllList(predicate));
        }

        /// <summary>
        /// Query
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="queryMethod"></param>
        /// <returns></returns>
        public virtual T Query<T>(Func<IQueryable<TEntity>, T> queryMethod)
        {
            return queryMethod(GetAll());
        }

        /// <summary>
        /// Get
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual TEntity Get(TPrimaryKey id)
        {
            TEntity val = FirstOrDefault(id);
            if (val == null)
            {
                throw new EntityNotFoundException(typeof(TEntity), id);
            }
            return val;
        }

        /// <summary>
        /// GetAsync
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual async Task<TEntity> GetAsync(TPrimaryKey id)
        {
            TEntity entity = await FirstOrDefaultAsync(id);
            if (entity == null)
            {
                throw new EntityNotFoundException(typeof(TEntity), id);
            }
            return entity;
        }

        /// <summary>
        /// Single
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual TEntity Single(Expression<Func<TEntity, bool>> predicate)
        {
            return GetAll().Single(predicate);
        }

        /// <summary>
        /// SingleAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task<TEntity> SingleAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return Task.FromResult(Single(predicate));
        }

        /// <summary>
        /// FirstOrDefault
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual TEntity FirstOrDefault(TPrimaryKey id)
        {
            return GetAll().FirstOrDefault(CreateEqualityExpressionForId(id));
        }

        /// <summary>
        /// FirstOrDefaultAsync
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual Task<TEntity> FirstOrDefaultAsync(TPrimaryKey id)
        {
            return Task.FromResult(FirstOrDefault(id));
        }

        /// <summary>
        /// FirstOrDefault
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual TEntity FirstOrDefault(Expression<Func<TEntity, bool>> predicate)
        {
            return GetAll().FirstOrDefault(predicate);
        }

        /// <summary>
        /// FirstOrDefaultAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task<TEntity> FirstOrDefaultAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return Task.FromResult(FirstOrDefault(predicate));
        }

        /// <summary>
        /// Load
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual TEntity Load(TPrimaryKey id)
        {
            return Get(id);
        }

        /// <summary>
        /// Insert
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public abstract TEntity Insert(TEntity entity);

        /// <summary>
        /// InsertAsync
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual Task<TEntity> InsertAsync(TEntity entity)
        {
            return Task.FromResult(Insert(entity));
        }

        /// <summary>
        /// InsertAndGetId
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual TPrimaryKey InsertAndGetId(TEntity entity)
        {
            return Insert(entity).Id;
        }

        /// <summary>
        /// InsertAndGetIdAsync
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual Task<TPrimaryKey> InsertAndGetIdAsync(TEntity entity)
        {
            return Task.FromResult(InsertAndGetId(entity));
        }

        /// <summary>
        /// InsertOrUpdate
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual TEntity InsertOrUpdate(TEntity entity)
        {
            return entity.IsTransient() ? Insert(entity) : Update(entity);
        }

        /// <summary>
        /// InsertOrUpdateAsync
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual async Task<TEntity> InsertOrUpdateAsync(TEntity entity)
        {
            return (!entity.IsTransient()) ? (await UpdateAsync(entity)) : (await InsertAsync(entity));
        }

        /// <summary>
        /// InsertOrUpdateAndGetId
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual TPrimaryKey InsertOrUpdateAndGetId(TEntity entity)
        {
            return InsertOrUpdate(entity).Id;
        }

        /// <summary>
        /// InsertOrUpdateAndGetIdAsync
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual Task<TPrimaryKey> InsertOrUpdateAndGetIdAsync(TEntity entity)
        {
            return Task.FromResult(InsertOrUpdateAndGetId(entity));
        }

        /// <summary>
        /// Update
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public abstract TEntity Update(TEntity entity);

        /// <summary>
        /// UpdateAsync
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public virtual Task<TEntity> UpdateAsync(TEntity entity)
        {
            return Task.FromResult(Update(entity));
        }

        /// <summary>
        /// Update
        /// </summary>
        /// <param name="id"></param>
        /// <param name="updateAction"></param>
        /// <returns></returns>
        public virtual TEntity Update(TPrimaryKey id, Action<TEntity> updateAction)
        {
            TEntity val = Get(id);
            updateAction(val);
            return val;
        }

        /// <summary>
        /// UpdateAsync
        /// </summary>
        /// <param name="id"></param>
        /// <param name="updateAction"></param>
        /// <returns></returns>
        public virtual async Task<TEntity> UpdateAsync(TPrimaryKey id, Func<TEntity, Task> updateAction)
        {
            TEntity entity = await GetAsync(id);
            await updateAction(entity);
            return entity;
        }

        /// <summary>
        /// Delete
        /// </summary>
        /// <param name="entity"></param>
        public abstract void Delete(TEntity entity);

        public virtual Task DeleteAsync(TEntity entity)
        {
            Delete(entity);
            return Task.FromResult(0);
        }

        /// <summary>
        /// Delete
        /// </summary>
        /// <param name="id"></param>
        public abstract void Delete(TPrimaryKey id);

        /// <summary>
        /// DeleteAsync
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public virtual Task DeleteAsync(TPrimaryKey id)
        {
            Delete(id);
            return Task.FromResult(0);
        }

        /// <summary>
        /// Delete
        /// </summary>
        /// <param name="predicate"></param>
        public virtual void Delete(Expression<Func<TEntity, bool>> predicate)
        {
            foreach (TEntity item in GetAll().Where(predicate).ToList())
            {
                Delete(item);
            }
        }

        /// <summary>
        /// DeleteAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task DeleteAsync(Expression<Func<TEntity, bool>> predicate)
        {
            Delete(predicate);
            return Task.FromResult(0);
        }

        /// <summary>
        /// Count
        /// </summary>
        /// <returns></returns>
        public virtual int Count()
        {
            return GetAll().Count();
        }

        /// <summary>
        /// CountAsync
        /// </summary>
        /// <returns></returns>
        public virtual Task<int> CountAsync()
        {
            return Task.FromResult(Count());
        }

        /// <summary>
        /// Count
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual int Count(Expression<Func<TEntity, bool>> predicate)
        {
            return GetAll().Where(predicate).Count();
        }

        /// <summary>
        /// CountAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task<int> CountAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return Task.FromResult(Count(predicate));
        }

        /// <summary>
        /// LongCount
        /// </summary>
        /// <returns></returns>
        public virtual long LongCount()
        {
            return GetAll().LongCount();
        }

        /// <summary>
        /// LongCountAsync
        /// </summary>
        /// <returns></returns>
        public virtual Task<long> LongCountAsync()
        {
            return Task.FromResult(LongCount());
        }

        /// <summary>
        /// LongCount
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual long LongCount(Expression<Func<TEntity, bool>> predicate)
        {
            return GetAll().Where(predicate).LongCount();
        }

        /// <summary>
        /// LongCountAsync
        /// </summary>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public virtual Task<long> LongCountAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return Task.FromResult(LongCount(predicate));
        }

        /// <summary>
        /// CreateEqualityExpressionForId
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        protected static Expression<Func<TEntity, bool>> CreateEqualityExpressionForId(TPrimaryKey id)
        {
            ParameterExpression parameterExpression = Expression.Parameter(typeof(TEntity));
            BinaryExpression body = Expression.Equal(Expression.PropertyOrField(parameterExpression, "Id"), Expression.Constant(id, typeof(TPrimaryKey)));
            return Expression.Lambda<Func<TEntity, bool>>(body, new ParameterExpression[1]
            {
            parameterExpression
            });
        }
    }
}
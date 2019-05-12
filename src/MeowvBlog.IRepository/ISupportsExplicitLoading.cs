using MeowvBlog.Entities;
using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

public interface ISupportsExplicitLoading<TEntity, TPrimaryKey> where TEntity : class, IEntity<TPrimaryKey>
{
    Task EnsureCollectionLoadedAsync<TProperty>(TEntity entity, Expression<Func<TEntity, IEnumerable<TProperty>>> collectionExpression, CancellationToken cancellationToken) where TProperty : class;

    Task EnsurePropertyLoadedAsync<TProperty>(TEntity entity, Expression<Func<TEntity, TProperty>> propertyExpression, CancellationToken cancellationToken) where TProperty : class;
}
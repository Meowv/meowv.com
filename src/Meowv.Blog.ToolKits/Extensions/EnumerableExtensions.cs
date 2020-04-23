using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class EnumerableExtensions
    {
        /// <summary>
        /// 去重
        /// </summary>
        public static IEnumerable<TSource> DistinctBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
        {
            var seenKeys = new HashSet<TKey>();
            return source.Where(element => seenKeys.Add(keySelector(element)));
        }

        /// <summary>
        /// 是否有重复
        /// </summary>
        /// <typeparam name="TSource"></typeparam>
        /// <typeparam name="TKey"></typeparam>
        /// <param name="source"></param>
        /// <param name="keySelector"></param>
        /// <returns></returns>
        public static bool HasRepeat<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
        {
            source.ThrowIfNull();
            var seenKeys = new HashSet<TKey>();
            return source.Count(element => seenKeys.Add(keySelector(element))) != source.Count();
        }

        /// <summary>
        /// 是否有重复
        /// </summary>
        /// <typeparam name="TSource"></typeparam>
        /// <param name="source"></param>
        /// <returns></returns>
        public static bool HasRepeat<TSource>(this IEnumerable<TSource> source)
        {
            source.ThrowIfNull();
            var seenKeys = new HashSet<TSource>();
            return source.Count(item => seenKeys.Add(item)) != source.Count();
        }

        /// <summary>
        /// WhereIf，满足条件进行查询
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="query"></param>
        /// <param name="condition"></param>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, int, bool>> predicate)
        {
            return condition ? query.Where(predicate) : query;
        }

        /// <summary>
        /// WhereIf，满足条件进行查询
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="query"></param>
        /// <param name="condition"></param>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, bool>> predicate)
        {
            return condition ? query.Where(predicate) : query;
        }
    }
}
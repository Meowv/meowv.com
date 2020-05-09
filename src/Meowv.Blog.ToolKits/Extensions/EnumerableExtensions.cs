using System;
using System.Collections.Generic;
using System.Linq;

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
        /// 分页查询
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="query"></param>
        /// <param name="pageIndex"></param>
        /// <param name="pageSize"></param>
        /// <returns></returns>
        public static IEnumerable<T> PageByIndex<T>(this IQueryable<T> query, int pageIndex, int pageSize)
        {
            query.ThrowIfNull();

            if (pageIndex <= 0)
            {
                pageIndex = 1;
            }
            if (pageSize <= 0)
            {
                pageSize = 10;
            }
            return query.Skip((pageIndex - 1) * pageSize).Take(pageSize);
        }

        /// <summary>
        /// 随机化 IEnumerable
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="source"></param>
        /// <param name="count"></param>
        /// <returns></returns>
        public static IEnumerable<T> Randomize<T>(this IEnumerable<T> source, int count = -1)
        {
            source.ThrowIfNull();

            var rnd = new Random();
            source = source.OrderBy(item => rnd.Next());
            if (count > 0)
            {
                source = source.Take(count);
            }
            return source;
        }
    }
}
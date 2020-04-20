using StackExchange.Redis;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Meowv.Blog.Application.Caching
{
    internal static class RedisExtensions
    {
        internal static HashEntry[] GetHashEntry<T>(this T entity, PropertyInfo[] propertyInfos)
        {
            return (from propertyInfo in propertyInfos
                    let value = propertyInfo.GetValue(entity).ToString()
                    let filedName = propertyInfo.Name
                    select new HashEntry(filedName, value)).ToArray();
        }

        internal static RedisKey[] ToRedisKeyArray(this string[] keys)
        {
            var arrayKey = new RedisKey[keys.Length];

            for (int i = 0, j = keys.Length; i < j; i++)
            {
                arrayKey[i] = keys[i];
            }

            return arrayKey;
        }

        internal static RedisValue[] ToRedisValueArray(this string[] values)
        {
            var arrayValue = new RedisValue[values.Length];

            for (int i = 0, j = values.Length; i < j; i++)
            {
                arrayValue[i] = values[i];
            }

            return arrayValue;
        }

        internal static KeyValuePair<RedisKey, RedisValue>[] ToKeyValuePairArray(this IDictionary<string, string> kvs)
        {
            return kvs.Select(a => new KeyValuePair<RedisKey, RedisValue>(a.Key, a.Value)).ToArray();
        }

        internal static KeyValuePair<string, string>[] ToHashPairs(this IEnumerable<HashEntry> entries)
        {
            return entries == null ? null : ToHashPairs(entries.ToArray());
        }

        internal static KeyValuePair<string, string>[] ToHashPairs(this HashEntry[] entries)
        {
            if (entries == null)
                return null;

            var result = new KeyValuePair<string, string>[entries.Length];
            for (int i = 0, j = result.Length; i < j; i++)
            {
                result[i] = new KeyValuePair<string, string>(entries[i].Name, entries[i].Value.HasValue ? (string)entries[i].Value : null);
            }

            return result;
        }

        internal static KeyValuePair<string, double>[] ToSortedPairs(this IEnumerable<SortedSetEntry> entries)
        {
            return entries == null ? null : ToSortedPairs(entries.ToArray());
        }

        internal static KeyValuePair<string, double>[] ToSortedPairs(this SortedSetEntry[] entries)
        {
            if (entries == null)
                return null;

            var result = new KeyValuePair<string, double>[entries.Length];
            for (int i = 0, j = result.Length; i < j; i++)
            {
                result[i] = new KeyValuePair<string, double>(entries[i].Element, entries[i].Score);
            }

            return result;
        }

        internal static SortedSetEntry[] ToSortedSetEntry(this IDictionary<string, double> members)
        {
            return members?.Select(a => new SortedSetEntry(a.Key, a.Value)).ToArray();
        }

        internal static TimeSpan? ToRedisTimeSpan(this int seconds)
        {
            return seconds <= 0 ? (TimeSpan?)null : TimeSpan.FromSeconds(seconds);
        }

        #region 枚举转换

        internal static SetOperation ToSetOperation(this RedisSetOperation operation)
        {
            switch (operation)
            {
                case RedisSetOperation.Union:
                    return SetOperation.Union;

                case RedisSetOperation.Intersect:
                    return SetOperation.Intersect;

                case RedisSetOperation.Difference:
                    return SetOperation.Difference;

                default:
                    throw new Exception("RedisProxy 非法的集合运算");
            }
        }

        internal static Aggregate ToAggregate(this RedisAggregate aggregate)
        {
            switch (aggregate)
            {
                case RedisAggregate.Sum:
                    return Aggregate.Sum;

                case RedisAggregate.Max:
                    return Aggregate.Max;

                case RedisAggregate.Min:
                    return Aggregate.Min;

                default:
                    throw new Exception("RedisProxy 非法的聚合运算");
            }
        }

        internal static Order ToOrder(this RedisOrder order)
        {
            switch (order)
            {
                case RedisOrder.Ascending:
                    return Order.Ascending;

                case RedisOrder.Descending:
                    return Order.Descending;

                default:
                    throw new Exception("RedisProxy 非法顺序");
            }
        }

        internal static Exclude ToExclude(this RedisExclude exclude)
        {
            return (Exclude)(int)exclude;
        }

        internal static RedisItemType ToType(this RedisType type)
        {
            return (RedisItemType)(int)type;
        }

        #endregion
    }
}
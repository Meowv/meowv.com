using EasyCaching.Core;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Caches
{
    /// <summary>
    /// 缓存接口
    /// </summary>
    public interface ICache
    {
        /// <summary>
        /// 是否存在指定键的缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        bool Exists(string cacheKey);

        /// <summary>
        /// 异步是否存在指定键的缓存
        /// </summary>
        /// <param name="cacheKey"></param>
        /// <returns></returns>
        Task<bool> ExistsAsync(string cacheKey);

        /// <summary>
        /// 刷新所有缓存项
        /// </summary>
        void Flush();

        /// <summary>
        /// 异步刷新所有缓存项
        /// </summary>
        /// <returns></returns>
        Task FlushAsync();

        /// <summary>
        /// 从缓存中获取数据，如果不存在，则执行获取数据操作并添加到缓存中
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="dataRetriever">获取数据操作</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        CacheValue<T> Get<T>(string cacheKey, Func<T> dataRetriever, TimeSpan? expiration = null);

        /// <summary>
        /// 从缓存中获取数据
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        CacheValue<T> Get<T>(string cacheKey);

        /// <summary>
        /// 获取所有缓存
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKeys">缓存键列表</param>
        /// <returns></returns>
        IDictionary<string, CacheValue<T>> GetAll<T>(IEnumerable<string> cacheKeys);

        /// <summary>
        /// 异步获取所有缓存
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKeys">缓存键列表</param>
        /// <returns></returns>
        Task<IDictionary<string, CacheValue<T>>> GetAllAsync<T>(IEnumerable<string> cacheKeys);

        /// <summary>
        /// 异步从缓存中获取数据，如果不存在，则执行获取数据操作并添加到缓存中
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="dataRetriever">获取数据操作</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        Task<CacheValue<T>> GetAsync<T>(string cacheKey, Func<Task<T>> dataRetriever, TimeSpan? expiration = null);

        /// <summary>
        /// 异步从缓存中获取数据
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        Task<CacheValue<T>> GetAsync<T>(string cacheKey);

        /// <summary>
        /// 移除指定缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        void Remove(string cacheKey);

        /// <summary>
        /// 异步移除指定缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        Task RemoveAsync(string cacheKey);

        /// <summary>
        /// 添加缓存，已存在不会添加
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="cacheValue">值</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        bool TrySet<T>(string cacheKey, T cacheValue, TimeSpan? expiration = null);

        /// <summary>
        /// 异步添加缓存，已存在不会添加
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="cacheValue">值</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        Task<bool> TrySetAsync<T>(string cacheKey, T cacheValue, TimeSpan? expiration = null);
    }
}
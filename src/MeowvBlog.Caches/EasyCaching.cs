using EasyCaching.Core;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Caches
{
    /// <summary>
    /// EasyCaching缓存实现
    /// </summary>
    public class EasyCaching : ICache
    {
        private readonly IEasyCachingProvider _provider;

        public EasyCaching(IEasyCachingProvider provider)
        {
            _provider = provider;
        }

        /// <summary>
        /// 是否存在指定键的缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        public bool Exists(string cacheKey)
        {
            return _provider.Exists(cacheKey);
        }

        /// <summary>
        /// 异步是否存在指定键的缓存
        /// </summary>
        /// <param name="cacheKey"></param>
        /// <returns></returns>
        public Task<bool> ExistsAsync(string cacheKey)
        {
            return _provider.ExistsAsync(cacheKey);
        }

        /// <summary>
        /// 刷新所有缓存项
        /// </summary>
        public void Flush()
        {
            _provider.Flush();
        }

        /// <summary>
        /// 异步刷新所有缓存项
        /// </summary>
        /// <returns></returns>
        public Task FlushAsync()
        {
            return _provider.FlushAsync();
        }

        /// <summary>
        /// 从缓存中获取数据，如果不存在，则执行获取数据操作并添加到缓存中
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="dataRetriever">获取数据操作</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        public CacheValue<T> Get<T>(string cacheKey, Func<T> dataRetriever, TimeSpan? expiration = null)
        {
            return _provider.Get(cacheKey, dataRetriever, expiration.GetSafeValue());
        }

        /// <summary>
        /// 从缓存中获取数据
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        public CacheValue<T> Get<T>(string cacheKey)
        {
            return _provider.Get<T>(cacheKey);
        }

        /// <summary>
        /// 获取所有缓存
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKeys">缓存键列表</param>
        /// <returns></returns>
        public IDictionary<string, CacheValue<T>> GetAll<T>(IEnumerable<string> cacheKeys)
        {
            return _provider.GetAll<T>(cacheKeys);
        }

        /// <summary>
        /// 异步获取所有缓存
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKeys">缓存键列表</param>
        /// <returns></returns>
        public Task<IDictionary<string, CacheValue<T>>> GetAllAsync<T>(IEnumerable<string> cacheKeys)
        {
            return _provider.GetAllAsync<T>(cacheKeys);
        }

        /// <summary>
        /// 异步从缓存中获取数据，如果不存在，则执行获取数据操作并添加到缓存中
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="dataRetriever">获取数据操作</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        public Task<CacheValue<T>> GetAsync<T>(string cacheKey, Func<Task<T>> dataRetriever, TimeSpan? expiration = null)
        {
            return _provider.GetAsync<T>(cacheKey, dataRetriever, expiration.GetSafeValue());
        }

        /// <summary>
        /// 异步从缓存中获取数据
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        public Task<CacheValue<T>> GetAsync<T>(string cacheKey)
        {
            return _provider.GetAsync<T>(cacheKey);
        }

        /// <summary>
        /// 移除指定缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        public void Remove(string cacheKey)
        {
            _provider.Remove(cacheKey);
        }

        /// <summary>
        /// 异步移除指定缓存
        /// </summary>
        /// <param name="cacheKey">缓存键</param>
        /// <returns></returns>
        public Task RemoveAsync(string cacheKey)
        {
            return _provider.RemoveAsync(cacheKey);
        }

        /// <summary>
        /// 添加缓存，已存在不会添加
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="cacheValue">值</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        public bool TrySet<T>(string cacheKey, T cacheValue, TimeSpan? expiration = null)
        {
            return _provider.TrySet(cacheKey, cacheValue, expiration.GetSafeValue());
        }

        /// <summary>
        /// 异步添加缓存，已存在不会添加
        /// </summary>
        /// <typeparam name="T">缓存数据类型</typeparam>
        /// <param name="cacheKey">缓存键</param>
        /// <param name="cacheValue">值</param>
        /// <param name="expiration">过期时间间隔</param>
        /// <returns></returns>
        public Task<bool> TrySetAsync<T>(string cacheKey, T cacheValue, TimeSpan? expiration = null)
        {
            return _provider.TrySetAsync(cacheKey, cacheValue, expiration.GetSafeValue());
        }
    }
}
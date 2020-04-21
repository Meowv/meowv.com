using Meowv.Blog.ToolKits;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching
{
    public static class Extensions
    {
        /// <summary>
        /// 获取或添加缓存
        /// </summary>
        /// <typeparam name="TCacheItem"></typeparam>
        /// <param name="cache"></param>
        /// <param name="key"></param>
        /// <param name="factory"></param>
        /// <param name="minutes"></param>
        /// <returns></returns>
        public static async Task<TCacheItem> GetOrAddAsync<TCacheItem>(this IDistributedCache cache, string key, Func<Task<TCacheItem>> factory, int minutes)
        {
            TCacheItem cacheItem;

            var result = await cache.GetStringAsync(key);
            if (result.IsNullOrEmpty())
            {
                cacheItem = await factory.Invoke();

                var options = new DistributedCacheEntryOptions()
                {
                    AbsoluteExpiration = DateTimeOffset.Now.AddMinutes(minutes)
                };

                await cache.SetStringAsync(key, cacheItem.SerializeToJson(), options);
            }
            else
            {
                cacheItem = result.DeserializeFromJson<TCacheItem>();
            }

            return cacheItem;
        }
    }
}
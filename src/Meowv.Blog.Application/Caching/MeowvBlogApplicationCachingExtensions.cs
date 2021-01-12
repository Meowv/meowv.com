using Meowv.Blog.Extensions;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching
{
    public static class MeowvBlogApplicationCachingExtensions
    {
        public static async Task<TCacheItem> GetOrAddAsync<TCacheItem>(this IDistributedCache cache, string key, Func<Task<TCacheItem>> factory, int minutes)
        {
            TCacheItem cacheItem;

            var result = await cache.GetStringAsync(key);
            if (string.IsNullOrEmpty(result))
            {
                cacheItem = await factory.Invoke();

                var options = new DistributedCacheEntryOptions();
                if (minutes != MeowvBlogConsts.CacheStrategy.NEVER)
                {
                    options.AbsoluteExpiration = DateTimeOffset.Now.AddMinutes(minutes);
                }

                await cache.SetStringAsync(key, cacheItem.SerializeToJson(), options);
            }
            else
            {
                cacheItem = result.DeserializeToObject<TCacheItem>();
            }

            return cacheItem;
        }
    }
}
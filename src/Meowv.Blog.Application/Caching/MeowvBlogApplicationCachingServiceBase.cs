using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Caching
{
    public class CachingServiceBase : ITransientDependency
    {
        protected readonly object ServiceProviderLock = new object();

        private IDistributedCache _cache;

        private IConnectionMultiplexer _connectionMultiplexer;

        public IServiceProvider ServiceProvider { get; set; }

        protected IDistributedCache Cache => LazyGetRequiredService(ref _cache);

        protected IConnectionMultiplexer ConnectionMultiplexer => LazyGetRequiredService(ref _connectionMultiplexer);

        protected TService LazyGetRequiredService<TService>(ref TService reference)
        {
            return LazyGetRequiredService(typeof(TService), ref reference);
        }

        protected TRef LazyGetRequiredService<TRef>(Type serviceType, ref TRef reference)
        {
            if (reference == null)
            {
                lock (ServiceProviderLock)
                {
                    if (reference == null)
                    {
                        reference = (TRef)ServiceProvider.GetRequiredService(serviceType);
                    }
                }
            }

            return reference;
        }

        public async Task RemoveAsync(string key)
        {
            if (key.IsNullOrWhiteSpace())
                throw new ArgumentException("Value cannot be null or whitespace.", nameof(key));

            foreach (var item in GetKeys(key + "*"))
            {
                await Cache.RemoveAsync(item);
            }
        }

        private IEnumerable<string> GetKeys(string pattern)
        {
            if (pattern.IsNullOrWhiteSpace())
                throw new ArgumentException("Value cannot be null or whitespace.", nameof(pattern));

            foreach (var endpoint in ConnectionMultiplexer.GetEndPoints())
            {
                var server = ConnectionMultiplexer.GetServer(endpoint);
                foreach (var key in server.Keys(pattern: pattern))
                {
                    yield return key.ToString();
                }
            }
        }
    }
}
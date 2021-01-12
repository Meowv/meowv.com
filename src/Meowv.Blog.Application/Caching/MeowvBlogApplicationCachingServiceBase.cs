using Meowv.Blog.Options;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using System;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Caching
{
    public class CachingServiceBase : ITransientDependency
    {
        protected readonly object ServiceProviderLock = new object();

        private IDistributedCache _cache;

        public IServiceProvider ServiceProvider { get; set; }

        public IOptions<StorageOptions> StorageOption { get; set; }

        protected IDistributedCache Cache => LazyGetRequiredService(ref _cache);

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

            var connectionMultiplexer = ConnectionMultiplexer.Connect(StorageOption.Value.Redis);
            var _database = connectionMultiplexer.GetDatabase();

            var cursor = 0L;
            var batchPageSize = 100;

            do
            {
                var scanResult = (RedisResult[])await _database.ExecuteAsync("scan", cursor, "MATCH", key + "*", "COUNT", batchPageSize);
                if (scanResult.Length >= 2)
                {
                    var nextCursor = (int)scanResult[0];
                    var keys = (RedisKey[])scanResult[1];
                    foreach (var item in keys)
                    {
                        await _database.KeyDeleteAsync(item);
                    }
                    cursor = nextCursor;
                }
            } while (cursor > 0);
        }
    }
}
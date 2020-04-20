using Meowv.Blog.Application.Contracts.Blog;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Caching;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public class BlogCacheService : ITransientDependency, IBlogCacheService
    {
        private readonly IDistributedCache<List<PostDto>> _cache;

        public BlogCacheService(IDistributedCache<List<PostDto>> cache)
        {
            _cache = cache;
        }

        public async Task<List<PostDto>> GetAllAsync(Func<Task<List<PostDto>>> func)
        {
            return await _cache.GetOrAddAsync("posts", func, () => new DistributedCacheEntryOptions
            {
                AbsoluteExpiration = DateTimeOffset.Now.AddHours(1)
            });
        }
    }
}
using Meowv.Blog.Application.Contracts.Blog;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public class BlogCacheService : ITransientDependency, IBlogCacheService
    {
        public readonly IDistributedCache _cache;

        public BlogCacheService(IDistributedCache cache)
        {
            _cache = cache;
        }

        public async Task<List<PostDto>> GetAllAsync(Func<Task<List<PostDto>>> factory)
        {
            return await _cache.GetOrAddAsync("test1", factory, 0);
        }
    }
}
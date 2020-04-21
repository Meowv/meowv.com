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
        private readonly IDistributedCache _distributed;

        public BlogCacheService(IDistributedCache distributed)
        {
            _distributed = distributed;
        }

        public async Task<List<PostDto>> GetAllAsync(Func<Task<List<PostDto>>> factory)
        {
            return await _distributed.GetOrAddAsync("test", factory, 1);
        }
    }
}
using Microsoft.Extensions.Caching.Distributed;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public partial class BlogCacheService : ITransientDependency, IBlogCacheService
    {
        public readonly IDistributedCache _cache;

        public BlogCacheService(IDistributedCache cache)
        {
            _cache = cache;
        }
    }
}
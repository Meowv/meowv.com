using Meowv.Blog.Caching;
using Meowv.Blog.Caching.Blog;
using Meowv.Blog.Domain.Blog;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Blog
{
    public class PostEventHandler : ILocalEventHandler<EntityCreatedEventData<Post>>,
                                    ILocalEventHandler<EntityDeletedEventData<Post>>,
                                    ILocalEventHandler<EntityUpdatedEventData<Post>>,
                                    ITransientDependency
    {
        private readonly IBlogCacheService _cache;

        public PostEventHandler(IBlogCacheService cache)
        {
            _cache = cache;
        }

        public async Task HandleEventAsync(EntityCreatedEventData<Post> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Post);
        }

        public async Task HandleEventAsync(EntityDeletedEventData<Post> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Post);
        }

        public async Task HandleEventAsync(EntityUpdatedEventData<Post> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Post);
        }
    }
}
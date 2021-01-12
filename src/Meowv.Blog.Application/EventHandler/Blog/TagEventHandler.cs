using Meowv.Blog.Caching;
using Meowv.Blog.Caching.Blog;
using Meowv.Blog.Domain.Blog;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Blog
{
    public class TagEventHandler : ILocalEventHandler<EntityCreatedEventData<Tag>>,
                                   ILocalEventHandler<EntityDeletedEventData<Tag>>,
                                   ILocalEventHandler<EntityUpdatedEventData<Tag>>,
                                   ITransientDependency
    {
        private readonly IBlogCacheService _cache;

        public TagEventHandler(IBlogCacheService cache)
        {
            _cache = cache;
        }

        public async Task HandleEventAsync(EntityCreatedEventData<Tag> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Tag);
        }

        public async Task HandleEventAsync(EntityDeletedEventData<Tag> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Tag);
        }

        public async Task HandleEventAsync(EntityUpdatedEventData<Tag> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Tag);
        }
    }
}
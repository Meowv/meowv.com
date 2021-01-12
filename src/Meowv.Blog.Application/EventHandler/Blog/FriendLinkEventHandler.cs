using Meowv.Blog.Caching;
using Meowv.Blog.Caching.Blog;
using Meowv.Blog.Domain.Blog;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Blog
{
    public class FriendLinkEventHandler : ILocalEventHandler<EntityCreatedEventData<FriendLink>>,
                                          ILocalEventHandler<EntityDeletedEventData<FriendLink>>,
                                          ILocalEventHandler<EntityUpdatedEventData<FriendLink>>,
                                          ITransientDependency
    {
        private readonly IBlogCacheService _cache;

        public FriendLinkEventHandler(IBlogCacheService cache)
        {
            _cache = cache;
        }

        public async Task HandleEventAsync(EntityCreatedEventData<FriendLink> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_FriendLink);
        }

        public async Task HandleEventAsync(EntityDeletedEventData<FriendLink> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_FriendLink);
        }

        public async Task HandleEventAsync(EntityUpdatedEventData<FriendLink> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_FriendLink);
        }
    }
}
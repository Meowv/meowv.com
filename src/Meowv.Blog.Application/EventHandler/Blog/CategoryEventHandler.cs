using Meowv.Blog.Caching;
using Meowv.Blog.Caching.Blog;
using Meowv.Blog.Domain.Blog;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Blog
{
    public class CategoryEventHandler : ILocalEventHandler<EntityCreatedEventData<Category>>,
                                        ILocalEventHandler<EntityDeletedEventData<Category>>,
                                        ILocalEventHandler<EntityUpdatedEventData<Category>>,
                                        ITransientDependency
    {
        private readonly IBlogCacheService _cache;

        public CategoryEventHandler(IBlogCacheService cache)
        {
            _cache = cache;
        }

        public async Task HandleEventAsync(EntityCreatedEventData<Category> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Category);
        }

        public async Task HandleEventAsync(EntityDeletedEventData<Category> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Category);
        }

        public async Task HandleEventAsync(EntityUpdatedEventData<Category> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Blog_Category);
        }
    }
}
using Meowv.Blog.Caching;
using Meowv.Blog.Caching.Hots;
using Meowv.Blog.Domain.Hots;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.News
{
    public class HotEventHandler : ILocalEventHandler<EntityDeletedEventData<Hot>>, ITransientDependency
    {
        private readonly IHotCacheService _cache;

        public HotEventHandler(IHotCacheService cache)
        {
            _cache = cache;
        }

        public async Task HandleEventAsync(EntityDeletedEventData<Hot> eventData)
        {
            await _cache.RemoveAsync(CachingConsts.CachePrefix.Hot);
        }
    }
}
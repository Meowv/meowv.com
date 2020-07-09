using Meowv.Blog.Application.Caching.Blog;
using Meowv.Blog.Application.EventBus.Blog;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.EventBus.Distributed;

namespace Meowv.Blog.Application.Caching.EventHandlers.Blog
{
    /// <summary>
    /// 事件订阅，自动发现并执行
    /// </summary>
    public class BlogCachingRemoveHandler : IDistributedEventHandler<CachingRemoveEventData>, ITransientDependency
    {
        private readonly IBlogCacheService _blogCacheService;

        public BlogCachingRemoveHandler(IBlogCacheService blogCacheService)
        {
            _blogCacheService = blogCacheService;
        }

        /// <summary>
        /// 清除缓存操作，指定Key前缀
        /// </summary>
        /// <param name="eventData"></param>
        /// <returns></returns>
        public async Task HandleEventAsync(CachingRemoveEventData eventData)
        {
            await _blogCacheService.RemoveAsync(eventData.Key);
        }
    }
}
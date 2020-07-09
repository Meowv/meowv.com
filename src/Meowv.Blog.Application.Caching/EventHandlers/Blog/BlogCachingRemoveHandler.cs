using Meowv.Blog.Application.EventBus.Blog;
using System;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.EventBus;

namespace Meowv.Blog.Application.Caching.EventHandlers.Blog
{
    public class BlogCachingRemoveHandler : ILocalEventHandler<InsertPostEventData>, ITransientDependency
    {
        public async Task HandleEventAsync(InsertPostEventData eventData)
        {
            Console.WriteLine(eventData);

            await Task.CompletedTask;
        }
    }
}
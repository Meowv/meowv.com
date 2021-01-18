using Meowv.Blog.Domain.Messages;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Messages
{
    public class MessageEventHandler : ILocalEventHandler<EntityCreatedEventData<Message>>,
                                       ITransientDependency
    {
        public async Task HandleEventAsync(EntityCreatedEventData<Message> eventData)
        {
            var title = $"Message from {eventData.Entity.Name}";
            var content = eventData.Entity.Content;

            await Task.CompletedTask;
        }
    }
}
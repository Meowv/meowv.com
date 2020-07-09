using Meowv.Blog.Domain;
using Volo.Abp.Domain.Entities.Events.Distributed;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Application.EventBus
{
    [DependsOn(typeof(MeowvBlogDomainModule))]
    public class MeowvBlogApplicationEventBusModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpDistributedEntityEventOptions>(options =>
            {
                options.AutoEventSelectors.AddAll();
            });
        }
    }
}
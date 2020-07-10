using Meowv.Blog.Domain;
using Meowv.Blog.Domain.Configurations;
using Volo.Abp.Domain.Entities.Events.Distributed;
using Volo.Abp.EventBus.RabbitMq;
using Volo.Abp.Modularity;
using Volo.Abp.RabbitMQ;

namespace Meowv.Blog.Application.EventBus
{
    [DependsOn(
        //typeof(AbpEventBusRabbitMqModule),
        typeof(MeowvBlogDomainModule)
    )]
    public class MeowvBlogApplicationEventBusModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpDistributedEntityEventOptions>(options =>
            {
                options.AutoEventSelectors.AddAll();
            });

            Configure<AbpRabbitMqOptions>(options =>
            {
                options.Connections.Default.UserName = AppSettings.RabbitMQ.Connections.Default.Username;
                options.Connections.Default.Password = AppSettings.RabbitMQ.Connections.Default.Password;
                options.Connections.Default.HostName = AppSettings.RabbitMQ.Connections.Default.HostName;
                options.Connections.Default.Port = AppSettings.RabbitMQ.Connections.Default.Port;
            });

            Configure<AbpRabbitMqEventBusOptions>(options =>
            {
                options.ClientName = AppSettings.RabbitMQ.EventBus.ClientName;
                options.ExchangeName = AppSettings.RabbitMQ.EventBus.ExchangeName;
            });
        }
    }
}
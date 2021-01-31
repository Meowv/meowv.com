using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson.Serialization.Conventions;
using Volo.Abp.Auditing;
using Volo.Abp.AuditLogging;
using Volo.Abp.AuditLogging.MongoDB;
using Volo.Abp.Modularity;
using Volo.Abp.Uow;

namespace Meowv.Blog
{
    [DependsOn(
        typeof(AbpAuditLoggingMongoDbModule),
        typeof(MeowvBlogCoreModule)
    )]
    public class MeowvBlogMongoDbModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.AddMongoDbContext<MeowvBlogMongoDbContext>(options =>
            {
                options.AddDefaultRepositories();
            });

            Configure<AbpUnitOfWorkDefaultOptions>(options =>
            {
                options.TransactionBehavior = UnitOfWorkTransactionBehavior.Disabled;
            });

            Configure<AbpAuditingOptions>(options =>
            {
                options.IsEnabledForGetRequests = true;
            });

            AbpAuditLoggingDbProperties.DbTablePrefix = "meowv_blog_";

            ConventionRegistry.Register("CamelCase", new ConventionPack { new CamelCaseElementNameConvention() }, type => true);
        }
    }
}
using Meowv.Blog.Options;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson.Serialization.Conventions;
using Volo.Abp.AuditLogging.MongoDB;
using Volo.Abp.Data;
using Volo.Abp.Modularity;
using Volo.Abp.MongoDB;
using Volo.Abp.Uow;

namespace Meowv.Blog
{
    [DependsOn(
        typeof(AbpMongoDbModule),
        typeof(AbpAuditLoggingMongoDbModule),
        typeof(MeowvBlogCoreModule)
    )]
    public class MeowvBlogMongoDbModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            var storageOptions = context.Services.ExecutePreConfiguredActions<StorageOptions>();

            Configure<AbpDbConnectionOptions>(options =>
            {
                options.ConnectionStrings.Default = storageOptions.Mongodb;
            });

            context.Services.AddMongoDbContext<MeowvBlogMongoDbContext>(options =>
            {
                options.AddDefaultRepositories();
            });

            Configure<AbpUnitOfWorkDefaultOptions>(options =>
            {
                options.TransactionBehavior = UnitOfWorkTransactionBehavior.Disabled;
            });

            ConventionRegistry.Register("CamelCase", new ConventionPack { new CamelCaseElementNameConvention() }, type => true);
        }
    }
}
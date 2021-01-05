using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson.Serialization.Conventions;
using Volo.Abp.Modularity;
using Volo.Abp.MongoDB;
using Volo.Abp.Uow;

namespace Meowv.Blog
{
    /// <summary>
    /// MongoDb Module
    /// </summary>
    [DependsOn(
        typeof(AbpMongoDbModule),
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

            ConventionRegistry.Register("CamelCase", new ConventionPack { new CamelCaseElementNameConvention() }, type => true);
        }
    }
}
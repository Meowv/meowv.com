using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace Meowv.Blog.DbMigrator
{
    [DependsOn(
        typeof(AbpAutofacModule),
        typeof(MeowvBlogMongoDbModule)
    )]
    public class MeowvBlogDbMigratorModule : AbpModule
    {
    }
}
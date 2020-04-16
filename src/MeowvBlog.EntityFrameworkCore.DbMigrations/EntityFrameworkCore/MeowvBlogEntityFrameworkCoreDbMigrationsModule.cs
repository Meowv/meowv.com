using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Modularity;

namespace MeowvBlog.EntityFrameworkCore
{
    [DependsOn(
        typeof(MeowvBlogEntityFrameworkCoreModule)
        )]
    public class MeowvBlogEntityFrameworkCoreDbMigrationsModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.AddAbpDbContext<MeowvBlogMigrationsDbContext>();
        }
    }
}

using Meowv.Blog.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.SqlServer;
using Volo.Abp.Modularity;

namespace Meowv.Blog.EntityFrameworkCore
{
    [DependsOn(
        typeof(MeowvBlogDomainModule),
        typeof(AbpEntityFrameworkCoreModule),
        typeof(AbpEntityFrameworkCoreSqlServerModule)
        )]
    public class MeowvBlogFrameworkCoreModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.AddAbpDbContext<MeowvBlogDbContext>(options =>
            {
                options.AddDefaultRepositories(includeAllEntities: true);
            });

            Configure<AbpDbContextOptions>(options =>
            {
                options.UseSqlServer();
            });
        }
    }
}
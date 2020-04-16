using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MeowvBlog.Data;
using Volo.Abp.DependencyInjection;

namespace MeowvBlog.EntityFrameworkCore
{
    public class EntityFrameworkCoreMeowvBlogDbSchemaMigrator
        : IMeowvBlogDbSchemaMigrator, ITransientDependency
    {
        private readonly IServiceProvider _serviceProvider;

        public EntityFrameworkCoreMeowvBlogDbSchemaMigrator(
            IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task MigrateAsync()
        {
            /* We intentionally resolving the MeowvBlogMigrationsDbContext
             * from IServiceProvider (instead of directly injecting it)
             * to properly get the connection string of the current tenant in the
             * current scope.
             */

            await _serviceProvider
                .GetRequiredService<MeowvBlogMigrationsDbContext>()
                .Database
                .MigrateAsync();
        }
    }
}
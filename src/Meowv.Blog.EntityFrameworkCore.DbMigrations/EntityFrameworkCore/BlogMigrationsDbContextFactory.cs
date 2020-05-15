using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Meowv.Blog.EntityFrameworkCore
{
    /* This class is needed for EF Core console commands
     * (like Add-Migration and Update-Database commands) */
    public class BlogMigrationsDbContextFactory : IDesignTimeDbContextFactory<BlogMigrationsDbContext>
    {
        public BlogMigrationsDbContext CreateDbContext(string[] args)
        {
            BlogEfCoreEntityExtensionMappings.Configure();

            var configuration = BuildConfiguration();

            var builder = new DbContextOptionsBuilder<BlogMigrationsDbContext>()
                .UseSqlServer(configuration.GetConnectionString("Default"));

            return new BlogMigrationsDbContext(builder.Options);
        }

        private static IConfigurationRoot BuildConfiguration()
        {
            var builder = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false);

            return builder.Build();
        }
    }
}

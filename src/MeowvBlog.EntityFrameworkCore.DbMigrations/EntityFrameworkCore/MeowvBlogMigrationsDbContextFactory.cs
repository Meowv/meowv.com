using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogMigrationsDbContextFactory : IDesignTimeDbContextFactory<MeowvBlogMigrationsDbContext>
    {
        public MeowvBlogMigrationsDbContext CreateDbContext(string[] args)
        {
            MeowvBlogEfCoreEntityExtensionMappings.Configure();

            var configuration = BuildConfiguration();

            var builder = new DbContextOptionsBuilder<MeowvBlogMigrationsDbContext>()
                .UseSqlServer(configuration.GetConnectionString("Default"));

            return new MeowvBlogMigrationsDbContext(builder.Options);
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
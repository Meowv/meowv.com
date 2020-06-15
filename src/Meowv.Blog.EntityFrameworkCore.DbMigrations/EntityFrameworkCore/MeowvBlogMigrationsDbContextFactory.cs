using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.IO;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.EntityFrameworkCore
{
    public class MeowvBlogMigrationsDbContextFactory : IDesignTimeDbContextFactory<MeowvBlogMigrationsDbContext>
    {
        public MeowvBlogMigrationsDbContext CreateDbContext(string[] args)
        {
            var configuration = BuildConfiguration();

            var EnableDb = configuration["ConnectionStrings:Enable"];

            var builder = new DbContextOptionsBuilder<MeowvBlogMigrationsDbContext>();

            switch (EnableDb)
            {
                case "MySql":
                    builder.UseMySql(configuration.GetConnectionString(EnableDb));
                    break;

                case "SqlServer":
                    builder.UseSqlServer(configuration.GetConnectionString(EnableDb));
                    break;

                case "PostgreSql":
                    builder.UseNpgsql(configuration.GetConnectionString(EnableDb));
                    break;

                case "Sqlite":
                    builder.UseSqlite(configuration.GetConnectionString(EnableDb));
                    break;
            }

            return new MeowvBlogMigrationsDbContext(builder.Options);
        }

        private static IConfigurationRoot BuildConfiguration()
        {
            var builder = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

            return builder.Build();
        }
    }
}
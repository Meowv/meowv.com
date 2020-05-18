using Microsoft.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.EntityFrameworkCore
{
    public class MeowvBlogMigrationsDbContext : AbpDbContext<MeowvBlogMigrationsDbContext>
    {
        public MeowvBlogMigrationsDbContext(DbContextOptions<MeowvBlogMigrationsDbContext> options) : base(options)
        {

        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            builder.Configure();
        }
    }
}
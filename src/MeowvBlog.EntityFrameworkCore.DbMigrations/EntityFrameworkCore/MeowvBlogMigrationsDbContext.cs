using Microsoft.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogMigrationsDbContext : AbpDbContext<MeowvBlogMigrationsDbContext>
    {
        public MeowvBlogMigrationsDbContext(DbContextOptions<MeowvBlogMigrationsDbContext> options) 
            : base(options)
        {

        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            builder.ConfigureMeowvBlog();
        }
    }
}
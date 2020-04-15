using Microsoft.EntityFrameworkCore;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;

namespace MeowvBlog.EntityFrameworkCore
{
    [ConnectionStringName("Default")]
    public class MeowvBlogDbContext : AbpDbContext<MeowvBlogDbContext>
    {
        // TODO
        // 在这里添加 DbSet properties

        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options) : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // TODO
        }
    }
}
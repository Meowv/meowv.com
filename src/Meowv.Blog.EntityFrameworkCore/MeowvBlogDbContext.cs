using Meowv.Blog.Domain.Blog;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore
{
    [ConnectionStringName("Default")]
    public class MeowvBlogDbContext : AbpDbContext<MeowvBlogDbContext>
    {
        public DbSet<Post> Posts { get; set; }
        
        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options)
            : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);
        }
    }
}
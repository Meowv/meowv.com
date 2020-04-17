using MeowvBlog.Users;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.Modeling;

namespace MeowvBlog.EntityFrameworkCore
{
    [ConnectionStringName("Default")]
    public class MeowvBlogDbContext : AbpDbContext<MeowvBlogDbContext>
    {
        public DbSet<AppUser> Users { get; set; }

        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options)
            : base(options)
        {

        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            builder.Entity<AppUser>(b =>
            {
                b.ToTable("Users");

                b.ConfigureByConvention();
            });
        }
    }
}
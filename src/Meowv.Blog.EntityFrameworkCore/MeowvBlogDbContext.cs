using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Signature;
using Meowv.Blog.Domain.Wallpaper;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore
{
    [ConnectionStringName("MySql")]
    public class MeowvBlogDbContext : AbpDbContext<MeowvBlogDbContext>
    {
        public DbSet<Post> Posts { get; set; }

        public DbSet<Category> Categories { get; set; }

        public DbSet<Tag> Tags { get; set; }

        public DbSet<PostTag> PostTags { get; set; }

        public DbSet<FriendLink> FriendLinks { get; set; }

        public DbSet<Signature> Signatures { get; set; }
        
        public DbSet<Wallpaper> Wallpapers { get; set; }

        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options)
            : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            builder.Configure();
        }
    }
}
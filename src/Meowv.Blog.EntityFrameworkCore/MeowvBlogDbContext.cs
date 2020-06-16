using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Gallery;
using Meowv.Blog.Domain.Signature;
using Meowv.Blog.Domain.Soul;
using Meowv.Blog.Domain.Wallpaper;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore
{
    [ConnectionString]
    public class MeowvBlogDbContext : AbpDbContext<MeowvBlogDbContext>
    {
        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options) : base(options)
        {
        }

        #region DbSet

        public DbSet<Post> Posts { get; set; }

        public DbSet<Category> Categories { get; set; }

        public DbSet<Tag> Tags { get; set; }

        public DbSet<PostTag> PostTags { get; set; }

        public DbSet<FriendLink> FriendLinks { get; set; }

        public DbSet<Wallpaper> Wallpapers { get; set; }

        public DbSet<Signature> Signatures { get; set; }

        public DbSet<ChickenSoup> ChickenSoups { get; set; }

        public DbSet<Album> Albums { get; set; }

        public DbSet<Image> Images { get; set; }

        #endregion DbSet

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Configure();
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            base.OnConfiguring(optionsBuilder);

            optionsBuilder.EnableSensitiveDataLogging();
        }
    }
}
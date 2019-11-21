using MeowvBlog.API.Configurations;
using MeowvBlog.API.Models.Entity.Blog;
using MeowvBlog.API.Models.Entity.ChickenSoup;
using MeowvBlog.API.Models.Entity.Gallery;
using MeowvBlog.API.Models.Entity.HotNews;
using MeowvBlog.API.Models.Entity.Signature;
using Microsoft.EntityFrameworkCore;

namespace MeowvBlog.API.Infrastructure
{
    public class MeowvBlogDBContext : DbContext
    {
        public DbSet<Post> Posts { get; set; }

        public DbSet<Category> Categories { get; set; }

        public DbSet<Tag> Tags { get; set; }

        public DbSet<PostTag> PostTags { get; set; }

        public DbSet<FriendLink> FriendLinks { get; set; }

        public DbSet<SignatureLog> SignatureLogs { get; set; }

        public DbSet<HotNews> HotNews { get; set; }

        public DbSet<Album> Albums { get; set; }

        public DbSet<Image> Images { get; set; }

        public DbSet<ChickenSoup> ChickenSoups { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseSqlite(AppSettings.SqliteConnectionString);
        }
    }
}
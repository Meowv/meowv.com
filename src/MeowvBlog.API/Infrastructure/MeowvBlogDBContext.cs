using MeowvBlog.API.Configurations;
using MeowvBlog.API.Models.Entity.Blog;
using MeowvBlog.API.Models.Entity.ChickenSoup;
using MeowvBlog.API.Models.Entity.Gallery;
using MeowvBlog.API.Models.Entity.HotNews;
using MeowvBlog.API.Models.Entity.Signature;
using MeowvBlog.API.Models.Entity.Wallpaper;
using Microsoft.EntityFrameworkCore;

namespace MeowvBlog.API.Infrastructure
{
    /// <summary>
    /// 数据库上下文类
    /// </summary>
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

        public DbSet<Wallpaper> Wallpapers { get; set; }

        /// <summary>
        /// 重写以配置要使用的数据库
        /// </summary>
        /// <param name="optionsBuilder"></param>
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            // 使用Sqlite
            optionsBuilder.UseSqlite(AppSettings.SqliteConnectionString);
        }
    }
}
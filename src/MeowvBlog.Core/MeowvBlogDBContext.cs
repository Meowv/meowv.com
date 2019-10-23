using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Signature;
using Microsoft.EntityFrameworkCore;

namespace MeowvBlog.Core
{
    public class MeowvBlogDBContext : DbContext
    {
        public DbSet<Post> Posts { get; set; }

        public DbSet<Category> Categories { get; set; }

        public DbSet<Tag> Tags { get; set; }

        public DbSet<PostTag> PostTags { get; set; }

        public DbSet<FriendLink> FriendLinks { get; set; }

        public DbSet<SignatureLog> SignatureLogs { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseSqlite(AppSettings.SqliteConnectionString);
        }
    }
}
using MeowvBlog.Core.Domain.Blog;
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

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseSqlite(@"Data Source=E:\Repositories\github\Blog\db\meowv.db");
        }
    }
}
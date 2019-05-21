using MeowvBlog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogDbContext : PlusDbContext
    {
        public MeowvBlogDbContext(DbContextOptions options) : base(options)
        {
        }

        public virtual DbSet<Post> Posts { get; set; }

        public virtual DbSet<Category> Categories { get; set; }

        public virtual DbSet<Tag> Tags { get; set; }

        public virtual DbSet<PostTag> PostTags { get; set; }

        public virtual DbSet<FriendLink> FriendLinks { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly);
        }
    }
}
using Meowv.Entity.Blog;
using Microsoft.EntityFrameworkCore;

namespace Meowv.Entity
{
    public class MeowvDbContext : DbContext
    {
        public MeowvDbContext(DbContextOptions<MeowvDbContext> options) : base(options) { }

        public DbSet<ArticleEntity> Articles { get; set; }

        public DbSet<TagEntity> Tags { get; set; }

        public DbSet<CategoryEntity> Categories { get; set; }

        public DbSet<ArticleTagEntity> ArticleTags { get; set; }

        public DbSet<ArticleCategoryEntity> ArticleCategories { get; set; }


        protected override void OnModelCreating(ModelBuilder builder)
        {
            builder.Entity<ArticleEntity>().Property(x => x.CreateTime).ValueGeneratedOnAdd();
            builder.Entity<ArticleEntity>().Property(x => x.IsDelete).HasDefaultValue(0);
            builder.Entity<TagEntity>().Property(x => x.CreateTime).ValueGeneratedOnAdd();
            builder.Entity<TagEntity>().Property(x => x.IsDelete).HasDefaultValue(0);
            builder.Entity<CategoryEntity>().Property(x => x.CreateTime).ValueGeneratedOnAdd();
            builder.Entity<CategoryEntity>().Property(x => x.IsDelete).HasDefaultValue(0);
            builder.Entity<ArticleTagEntity>().Property(x => x.CreateTime).ValueGeneratedOnAdd();
            builder.Entity<ArticleTagEntity>().Property(x => x.IsDelete).HasDefaultValue(0);
            builder.Entity<ArticleCategoryEntity>().Property(x => x.CreateTime).ValueGeneratedOnAdd();
            builder.Entity<ArticleCategoryEntity>().Property(x => x.IsDelete).HasDefaultValue(0);
        }
    }
}
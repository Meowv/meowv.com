using MeowvBlog.Models.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.Repository.MySql.Configurations
{
    public class CategoryConfiguration : IEntityTypeConfiguration<Category>
    {
        public void Configure(EntityTypeBuilder<Category> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();

            builder.Property(x => x.CategoryName).HasMaxLength(50).IsRequired();

            builder.Property(x => x.DisplayName).HasMaxLength(50).IsRequired();

            builder.ToTable(DbConsts.DbTableName.Categories);
        }
    }
}
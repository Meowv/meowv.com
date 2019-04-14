using MeowvBlog.Core.Domain.Categories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;

namespace MeowvBlog.EntityFramework.Mappers.Categories
{
    public class CategoryMapper : IEntityTypeConfiguration<Category>
    {
        public void Configure(EntityTypeBuilder<Category> builder)
        {
            builder.ToTable(DbTableName.Categories);
            builder.HasKey(x => x.Id);
        }
    }
}
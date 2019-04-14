using MeowvBlog.Core.Domain.Articles;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;

namespace MeowvBlog.EntityFramework.Mappers.Articles
{
    public class ArticleCategoryMapper : IEntityTypeConfiguration<ArticleCategory>
    {
        public void Configure(EntityTypeBuilder<ArticleCategory> builder)
        {
            builder.ToTable(DbTableName.ArticleCategories);
            builder.HasKey(x => x.Id);
        }
    }
}
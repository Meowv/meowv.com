using MeowvBlog.Core.Domain.Articles;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;

namespace MeowvBlog.EntityFramework.Mappers.Articles
{
    public class ArticleTagMapper : IEntityTypeConfiguration<ArticleTag>
    {
        public void Configure(EntityTypeBuilder<ArticleTag> builder)
        {
            builder.ToTable(DbTableName.ArticleTags);
            builder.HasKey(x => x.Id);
        }
    }
}
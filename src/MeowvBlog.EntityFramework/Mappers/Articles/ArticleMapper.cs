using MeowvBlog.Core.Domain.Articles;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;

namespace MeowvBlog.EntityFramework.Mappers.Articles
{
    public class ArticleMapper : IEntityTypeConfiguration<Article>
    {
        public void Configure(EntityTypeBuilder<Article> builder)
        {
            builder.ToTable(DbTableName.Articles);
            builder.HasKey(x => x.Id);
        }
    }
}
using MeowvBlog.Core.Domain.NiceArticle;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class NiceArticleConfiguration : IEntityTypeConfiguration<NiceArticle>
    {
        public void Configure(EntityTypeBuilder<NiceArticle> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();
            builder.ToTable(DbConsts.DbTableName.NiceArticles);
        }
    }
}
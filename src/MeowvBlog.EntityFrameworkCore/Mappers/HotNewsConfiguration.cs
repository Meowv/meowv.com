using MeowvBlog.Core.Domain.HotNews;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class HotNewsConfiguration : IEntityTypeConfiguration<HotNews>
    {
        public void Configure(EntityTypeBuilder<HotNews> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();
            builder.ToTable(DbConsts.DbTableName.HotNews);
        }
    }
}
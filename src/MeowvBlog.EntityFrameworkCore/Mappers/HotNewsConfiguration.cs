using MeowvBlog.Core.Domain.HotNews;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class HotNewsConfiguration : IEntityTypeConfiguration<HotNews>
    {
        public void Configure(EntityTypeBuilder<HotNews> builder)
        {
            builder.ToTable(DbConsts.DbTableName.HotNews);
        }
    }
}
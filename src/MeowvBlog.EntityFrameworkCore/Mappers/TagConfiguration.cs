using MeowvBlog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class TagConfiguration : IEntityTypeConfiguration<Tag>
    {
        public void Configure(EntityTypeBuilder<Tag> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();

            builder.Property(x => x.TagName).HasMaxLength(50).IsFixedLength().IsRequired();

            builder.Property(x => x.DisplayName).HasMaxLength(50).IsFixedLength().IsRequired();

            builder.ToTable(DbConsts.DbTableName.Tags);
        }
    }
}
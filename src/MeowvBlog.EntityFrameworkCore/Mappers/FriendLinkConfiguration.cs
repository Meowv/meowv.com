using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class FriendLinkConfiguration : IEntityTypeConfiguration<FriendLink>
    {
        public void Configure(EntityTypeBuilder<FriendLink> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();

            builder.Property(x => x.Title).HasMaxLength(20).IsFixedLength().IsRequired();

            builder.Property(x => x.LinkUrl).HasMaxLength(100).IsFixedLength().IsRequired();

            builder.ToTable(DbConsts.DbTableName.FriendLinks);
        }
    }
}
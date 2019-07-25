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
            builder.ToTable(DbConsts.DbTableName.FriendLinks);
        }
    }
}
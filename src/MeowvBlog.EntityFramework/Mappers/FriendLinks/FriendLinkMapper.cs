using MeowvBlog.Core.Domain.FriendLinks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;
namespace MeowvBlog.EntityFramework.Mappers.FriendLinks
{
    public class FriendLinkMapper : IEntityTypeConfiguration<FriendLink>
    {
        public void Configure(EntityTypeBuilder<FriendLink> builder)
        {
            builder.ToTable(DbTableName.FriendLinks);
            builder.HasKey(x => x.Id);
        }
    }
}
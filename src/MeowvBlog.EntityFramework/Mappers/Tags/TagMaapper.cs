using MeowvBlog.Core.Domain.Tags;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static MeowvBlog.EntityFramework.MeowvBlogDbConsts;

namespace MeowvBlog.EntityFramework.Mappers.Tags
{
    public class TagMaapper : IEntityTypeConfiguration<Tag>
    {
        public void Configure(EntityTypeBuilder<Tag> builder)
        {
            builder.ToTable(DbTableName.Tags);
            builder.HasKey(x => x.Id);
        }
    }
}
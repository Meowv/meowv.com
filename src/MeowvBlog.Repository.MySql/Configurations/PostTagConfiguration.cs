using MeowvBlog.Models.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.Repository.MySql.Configurations
{
    public class PostTagConfiguration : IEntityTypeConfiguration<PostTag>
    {
        public void Configure(EntityTypeBuilder<PostTag> builder)
        {
            builder.HasKey(x => new { x.PostId, x.TagId });

            builder.HasOne(x => x.Post)
                   .WithMany(x => x.PostTags)
                   .HasForeignKey(x => x.PostId)
                   .HasConstraintName("FK_PostTag_Post");

            builder.HasOne(x => x.Tag)
                   .WithMany(x => x.PostTags)
                   .HasForeignKey(x => x.TagId)
                   .HasConstraintName("FK_PostTag_Tag");

            builder.ToTable(DbConsts.DbTableName.Post_Tags);
        }
    }
}
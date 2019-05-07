using MeowvBlog.Core.Entities.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.Data.Configurations
{
    internal class PostConfiguration : IEntityTypeConfiguration<Post>
    {
        public void Configure(EntityTypeBuilder<Post> builder)
        {
            builder.HasKey(p => p.Id);
            builder.Property(p => p.Id).UseMySqlIdentityColumn();

            builder.Property(p => p.Hits).HasDefaultValue(1);

            builder.Property(p => p.CreationTime).HasColumnType("datetime");
        }
    }
}
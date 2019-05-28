using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class PostConfiguration : IEntityTypeConfiguration<Post>
    {
        public void Configure(EntityTypeBuilder<Post> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();

            builder.Property(x => x.Title).HasMaxLength(100).IsFixedLength().IsRequired();

            builder.Property(x => x.Author).HasMaxLength(10).IsFixedLength().IsRequired();

            builder.Property(x => x.Source).HasMaxLength(20).IsFixedLength().IsRequired();

            builder.Property(x => x.Url).HasMaxLength(100).IsFixedLength().IsRequired();

            builder.Property(x => x.Abstract).HasMaxLength(200).IsFixedLength().IsRequired();

            builder.Property(x => x.Content).HasColumnType("longtext").IsRequired();

            builder.Property(x => x.Hits).HasDefaultValue(0);

            builder.Property(x => x.CreationTime).HasColumnType("datetime");

            builder.ToTable(DbConsts.DbTableName.Posts);
        }
    }
}
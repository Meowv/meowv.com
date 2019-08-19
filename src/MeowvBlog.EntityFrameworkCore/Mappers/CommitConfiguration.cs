using MeowvBlog.Core.Domain.Commits;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class CommitConfiguration : IEntityTypeConfiguration<Commit>
    {
        public void Configure(EntityTypeBuilder<Commit> builder)
        {
            builder.ToTable(DbConsts.DbTableName.Commits);
        }
    }
}
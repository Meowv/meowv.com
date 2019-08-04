using MeowvBlog.Core.Domain.Signature;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeowvBlog.EntityFrameworkCore.Mappers
{
    public class SignatureLogConfiguration : IEntityTypeConfiguration<SignatureLog>
    {
        public void Configure(EntityTypeBuilder<SignatureLog> builder)
        {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();
            builder.ToTable(DbConsts.DbTableName.Signature_Logs);
        }
    }
}
using Microsoft.EntityFrameworkCore;
using Volo.Abp;

namespace Meowv.Blog.EntityFrameworkCore
{
    public static class MeowvBlogDbContextModelCreatingExtensions
    {
        public static void Configure(this ModelBuilder builder)
        {
            Check.NotNull(builder, nameof(builder));

            /* Configure your own tables/entities inside here */

            //builder.Entity<YourEntity>(b =>
            //{
            //    b.ToTable(TestConsts.DbTablePrefix + "YourEntities", TestConsts.DbSchema);

            //    //...
            //});
        }
    }
}
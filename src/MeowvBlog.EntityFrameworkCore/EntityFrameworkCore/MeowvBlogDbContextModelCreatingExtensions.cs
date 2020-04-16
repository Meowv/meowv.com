using Microsoft.EntityFrameworkCore;
using Volo.Abp;

namespace MeowvBlog.EntityFrameworkCore
{
    public static class MeowvBlogDbContextModelCreatingExtensions
    {
        public static void ConfigureMeowvBlog(this ModelBuilder builder)
        {
            Check.NotNull(builder, nameof(builder));

            /* Configure your own tables/entities inside here */

            //builder.Entity<YourEntity>(b =>
            //{
            //    b.ToTable(MeowvBlogConsts.DbTablePrefix + "YourEntities", MeowvBlogConsts.DbSchema);

            //    //...
            //});
        }
    }
}
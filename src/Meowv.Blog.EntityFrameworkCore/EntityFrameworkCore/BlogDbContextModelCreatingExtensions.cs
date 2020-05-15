using Microsoft.EntityFrameworkCore;
using Volo.Abp;

namespace Meowv.Blog.EntityFrameworkCore
{
    public static class BlogDbContextModelCreatingExtensions
    {
        public static void ConfigureBlog(this ModelBuilder builder)
        {
            Check.NotNull(builder, nameof(builder));

            /* Configure your own tables/entities inside here */

            //builder.Entity<YourEntity>(b =>
            //{
            //    b.ToTable(BlogConsts.DbTablePrefix + "YourEntities", BlogConsts.DbSchema);

            //    //...
            //});
        }
    }
}
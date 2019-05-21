using MeowvBlog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogDbContext : PlusDbContext
    {
        public MeowvBlogDbContext(DbContextOptions options) : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly);
        }
    }
}
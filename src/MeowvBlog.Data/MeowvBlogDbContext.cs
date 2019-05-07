using MeowvBlog.Core.Entities.Blog;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Text;

namespace MeowvBlog.Data
{
    public class MeowvBlogDbContext : DbContext
    {
        public MeowvBlogDbContext()
        {
        }

        public MeowvBlogDbContext(DbContextOptions options) : base(options)
        {
        }

        public virtual DbSet<Post> Posts { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {

        }
    }
}
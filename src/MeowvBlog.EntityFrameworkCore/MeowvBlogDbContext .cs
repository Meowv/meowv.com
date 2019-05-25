using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Debug;
using Plus.EntityFramework;
using Plus.Reflection;
using System;
using System.Collections.Generic;
using System.Reflection;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogDbContext : PlusDbContext
    {
        private readonly ITypeFinder _typeFinder = Plus.PlusEngine.Instance.Resolve<ITypeFinder>();

        public MeowvBlogDbContext(DbContextOptions options) : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            var assemblies = new List<Assembly>
            {
                Assembly.GetExecutingAssembly()
            };

            var typesToRegister = _typeFinder.FindClassesOfType(typeof(IEntityTypeConfiguration<>), assemblies);
            foreach (var type in typesToRegister)
            {
                dynamic configurationInstance = Activator.CreateInstance(type);
                modelBuilder.ApplyConfiguration(configurationInstance);
            }
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseLoggerFactory(new LoggerFactory(new[] { new DebugLoggerProvider() }));

            base.OnConfiguring(optionsBuilder);
        }
    }
}
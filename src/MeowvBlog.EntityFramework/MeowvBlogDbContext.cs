using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Debug;
using System;
using System.Collections.Generic;
using System.Reflection;
using UPrime.EntityFramework;
using UPrime.Reflection;

namespace MeowvBlog.EntityFramework
{
    public class MeowvBlogDbContext : UPrimeDbContext
    {
        private readonly ITypeFinder _typeFinder = UPrime.UPrimeEngine.Instance.Resolve<ITypeFinder>();

        public MeowvBlogDbContext(DbContextOptions<MeowvBlogDbContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            var assemblies = new List<Assembly>
            {
                Assembly.GetExecutingAssembly()
            };

            var typesToRegister = _typeFinder.FindClassesOfType(typeof(IEntityTypeConfiguration<>), assemblies);
            typesToRegister.ForEach(type =>
            {
                dynamic configurationInstance = Activator.CreateInstance(type);
                modelBuilder.ApplyConfiguration(configurationInstance);
            });
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseLoggerFactory(new LoggerFactory(new[] { new DebugLoggerProvider() }));

            base.OnConfiguring(optionsBuilder);
        }
    }
}
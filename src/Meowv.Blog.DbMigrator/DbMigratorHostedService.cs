using Meowv.Blog.DataSeed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Threading;
using System.Threading.Tasks;
using Volo.Abp;

namespace Meowv.Blog.DbMigrator
{
    public class DbMigratorHostedService : IHostedService
    {
        private readonly IHostApplicationLifetime _hostApplicationLifetime;

        public DbMigratorHostedService(IHostApplicationLifetime hostApplicationLifetime)
        {
            _hostApplicationLifetime = hostApplicationLifetime;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            using var application = AbpApplicationFactory.Create<MeowvBlogDbMigratorModule>(options =>
            {
                options.UseAutofac();
            });
            application.Initialize();

            Console.WriteLine("Executing database seed.");

            {
                Console.WriteLine("Initialize user data...");
                await application.ServiceProvider
                                 .GetRequiredService<UserDataSeedService>()
                                 .SeedAsync();

                Console.WriteLine("Initialize message data..");
                await application.ServiceProvider
                                 .GetRequiredService<MessageDataSeedService>()
                                 .SeedAsync();

                Console.WriteLine("Initialize saying data...");
                await application.ServiceProvider
                                 .GetRequiredService<SayingDataSeedService>()
                                 .SeedAsync();

                Console.WriteLine("Initialize blog data...");
                await application.ServiceProvider
                                 .GetRequiredService<BlogDataSeedService>()
                                 .SeedAsync();
            }

            Console.WriteLine("Successfully completed database seed.");

            application.Shutdown();
            _hostApplicationLifetime.StopApplication();
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
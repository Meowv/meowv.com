using Meowv.Blog.Extensions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using Serilog.Events;
using System;
using System.IO;
using System.Threading.Tasks;

namespace Meowv.Blog.Api
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            Log.Logger = new LoggerConfiguration()
#if DEBUG
                .MinimumLevel.Debug()
#else
                .MinimumLevel.Information()
#endif
                .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
                .Enrich.FromLogContext()
                .WriteTo.Async(c => c.File("Logs/logs.txt"))
#if DEBUG
                .WriteTo.Async(c => c.Console())
#endif
                .CreateLogger();

            try
            {
                Log.Information("Starting api.");
                await CreateHostBuilder(args).Build().RunAsync();
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "Program terminated unexpectedly!");
            }
            finally
            {
                Log.CloseAndFlush();
                Log.Information("Program has closed!");
            }
        }

        internal static IHostBuilder CreateHostBuilder(string[] args)
        {
            var config = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory())
                                                   .AddYamlFile("appsettings.yml", optional: true, reloadOnChange: true)
                                                   .AddCommandLine(args)
                                                   .Build();

            var builder = Host.CreateDefaultBuilder(args)
                              .ConfigureWebHostDefaults(webBuilder =>
                              {
                                  webBuilder.UseConfiguration(config)
                                            .UseContentRoot(Directory.GetCurrentDirectory())
                                            .ConfigureKestrel(c =>
                                            {
                                                c.AddServerHeader = false;
                                            }).UseStartup<Startup>();
                              }).ConfigureServices((ctx, services) =>
                              {
                                  services.AddSingleton(config);
                                  services.AddHttpContextAccessor();
                              }).UseAutofac().UseSerilog();
            return builder;
        }
    }
}
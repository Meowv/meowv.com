using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Threading.Tasks;

namespace Meowv.Blog.Web
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var host = Host.CreateDefaultBuilder(args)
                           .ConfigureWebHostDefaults(webBuilder =>
                           {
                               webBuilder.UseStartup<Startup>();
                           }).ConfigureServices(services =>
                           {
                               services.AddControllersWithViews();
                           });
            await host.Build().RunAsync();
        }
    }
}
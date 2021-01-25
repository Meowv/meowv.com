using AntDesign.Pro.Layout;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var host = Host.CreateDefaultBuilder(args)
                           .ConfigureWebHostDefaults(webBuilder =>
                           {
                               webBuilder.UseStartup<Startup>();
                           })
                           .ConfigureServices(services =>
                           {
                               services.AddRazorPages();
                               services.AddServerSideBlazor();
                               services.AddAntDesign();
                               services.AddScoped(sp => new HttpClient { BaseAddress = new Uri("https://localhost:44380") });
                               services.Configure<ProSettings>(x =>
                               {
                                   x.Title = "阿星Plus";
                                   x.HeaderHeight = 50;
                               });
                           });
            await host.Build().RunAsync();
        }
    }
}
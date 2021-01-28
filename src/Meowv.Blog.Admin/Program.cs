using AntDesign.Pro.Layout;
using Meowv.Blog.Admin.Services;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
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
                               webBuilder.UseSetting(WebHostDefaults.DetailedErrorsKey, "true");
                               webBuilder.UseStartup<Startup>();
                           })
                           .ConfigureServices(services =>
                           {
                               services.AddRazorPages();
                               services.AddServerSideBlazor();
                               services.AddAntDesign();
                               services.AddScoped<AuthenticationStateProvider, OAuthService>();
                               services.Configure<ProSettings>(x =>
                               {
                                   x.Title = "阿星Plus";
                                   x.NavTheme = "light";
                                   x.Layout = "mix";
                                   x.PrimaryColor = "daybreak";
                                   x.ContentWidth = "Fluid";
                                   x.HeaderHeight = 50;
                               });
                               services.AddHttpClient("api", x =>
                               {
                                   x.BaseAddress = new Uri("https://localhost:44380");
                               });

                           });
            await host.Build().RunAsync();
        }
    }
}
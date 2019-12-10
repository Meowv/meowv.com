using MeowvBlog.Web.Hubs;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text.Encodings.Web;
using System.Text.Unicode;
using System.Threading.Tasks;

namespace MeowvBlog.Web
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            await Host.CreateDefaultBuilder(args).ConfigureWebHostDefaults(builder =>
            {
                builder.ConfigureKestrel(options => { options.AddServerHeader = false; })
                       .UseUrls("http://*:5001")
                       .UseStartup<Program>();
            }).Build().RunAsync();
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllersWithViews();
            services.AddSignalR();
            services.AddSingleton(HtmlEncoder.Create(new[] { UnicodeRanges.BasicLatin, UnicodeRanges.CjkUnifiedIdeographs }));
        }

        public void Configure(IApplicationBuilder app)
        {
            app.UseStatusCodePages();
            app.UseHttpsRedirection();
            app.UseStaticFiles();
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
                endpoints.MapHub<ConnectionHub>("/connection");
            });
        }
    }
}
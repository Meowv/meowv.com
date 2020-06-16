using Meowv.Blog.ToolKits.Extensions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using System.Threading.Tasks;

namespace Meowv.Blog.HttpApi.Hosting
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            await Host.CreateDefaultBuilder(args)
                      .UseLog4Net()
                      .ConfigureWebHostDefaults(builder =>
                      {
                          builder.UseIISIntegration()
                                 .ConfigureKestrel(options => {
                                     options.AddServerHeader = false;
                                 })
                                 .UseUrls("http://*:5009")
                                 .UseStartup<Startup>();
                      }).UseAutofac().Build().RunAsync();
        }
    }
}
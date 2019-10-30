using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using System.Threading.Tasks;

namespace MeowvBlog.Web
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            await Host.CreateDefaultBuilder(args)
                      .ConfigureWebHostDefaults(builder =>
                      {
                          builder.ConfigureKestrel(options => { options.AddServerHeader = false; })
                                 .UseUrls("http://*:5001")
                                 .UseStartup<Startup>();
                      }).Build().RunAsync();
        }
    }
}
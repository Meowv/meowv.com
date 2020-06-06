using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.BlazorApp
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var baseAddress = "https://localhost:5001";

            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("app");

            builder.Services.AddTransient(sp => new HttpClient
            {
                BaseAddress = new Uri(baseAddress)
            });

            await builder.Build().RunAsync();
        }
    }
}
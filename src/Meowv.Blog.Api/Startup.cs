using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Meowv.Blog.Api
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services) => services.AddApplication<MeowvBlogApiModule>();

        public void Configure(IApplicationBuilder app) => app.InitializeApplication();
    }
}
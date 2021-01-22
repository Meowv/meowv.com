using Microsoft.AspNetCore.Builder;

namespace Meowv.Blog.Web
{
    public class Startup
    {
        public void Configure(IApplicationBuilder app)
        {
            app.UseExceptionHandler("/error");
            app.UseStatusCodePagesWithRedirects("/error");
            app.UseHsts();
            app.UseHttpsRedirection();
            app.UseStaticFiles();
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapRazorPages();
            });
        }
    }
}
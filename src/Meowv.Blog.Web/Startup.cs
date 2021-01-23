using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.StaticFiles;

namespace Meowv.Blog.Web
{
    public class Startup
    {
        public void Configure(IApplicationBuilder app)
        {
            var provider = new FileExtensionContentTypeProvider();
            provider.Mappings[".mtn"] = "application/octet-stream";
            provider.Mappings[".moc"] = "application/octet-stream";

            app.UseExceptionHandler("/error");
            app.UseStatusCodePagesWithRedirects("/error");
            app.UseHsts();
            app.UseHttpsRedirection();
            app.UseStaticFiles(new StaticFileOptions
            {
                ContentTypeProvider = provider
            });
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapRazorPages();
            });
        }
    }
}
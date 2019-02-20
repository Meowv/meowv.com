using Meowv.DataModel.Blog;
using Meowv.Entity;
using Meowv.Provider.Bolg;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.IO;

namespace Meowv.Web
{
    public class Startup
    {
        public IConfiguration Configuration { get; }

        public Startup(IHostingEnvironment env)
        {
            var builder = new ConfigurationBuilder()
                .SetBasePath(env.ContentRootPath)
                .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);
            Configuration = builder.Build();
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddAuthentication(options =>
            {
                options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            }).AddCookie();
            services.AddSession();
            services.AddOptions();
            services.AddDbContext<MeowvDbContext>(options =>
            {
                options.UseMySql(Configuration.GetConnectionString("Meowv"));
            });
            services.AddRouting(routes =>
            {
                routes.LowercaseUrls = true;
                routes.AppendTrailingSlash = false;
            });
            services.AddSwaggerGen(x =>
            {
                x.SwaggerDoc("Meowv", null);
                x.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "Meowv.xml"));
            });

            services.AddScoped<ArticleDataModel>();
            services.AddScoped<ArticleProvider>();

            services.AddMvc().SetCompatibilityVersion(CompatibilityVersion.Version_2_2);
        }

        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseHsts();
            }
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/Meowv/swagger.json", "MEOWV API");
            });
            app.UseSession();
            app.UseAuthentication();
            app.UseHttpsRedirection();
            app.UseStaticFiles();
            app.UseMvcWithDefaultRoute();
        }
    }
}
using Meowv.Blog.Domain;
using Meowv.Blog.EntityFrameworkCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Volo.Abp;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace Meowv.Blog.HttpApi.Hosting
{
    [DependsOn(
        typeof(MeowvBlogHttpApiModule),
        typeof(MeowvBlogDomainModule),
        typeof(MeowvBlogFrameworkCoreModule),
        typeof(AbpAspNetCoreMvcModule),
        typeof(AbpAutofacModule))]
    public class MeowvBlogHttpApiHostingModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            ConfigureSwaggerServices(context.Services);
        }

        private void ConfigureSwaggerServices(IServiceCollection services)
        {
            services.AddSwaggerGen(
                options =>
                {
                    options.SwaggerDoc("v1", new OpenApiInfo { Title = "API", Version = "v1" });
                }
            );
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var env = context.GetEnvironment();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
            }

            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/v1/swagger.json", "MeowvBlog API");
            });

            app.UseStaticFiles();
            app.UseRouting();
            app.UseMvcWithDefaultRouteAndArea();
        }
    }
}
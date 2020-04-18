using Meowv.Blog.Domain;
using Meowv.Blog.EntityFrameworkCore;
using Meowv.Blog.HttpApi.Hosting.Swagger;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
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
            services.AddSwagger();
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var env = context.GetEnvironment();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseSwagger();
            app.UseSwaggerUI();
            app.UseRouting();
            app.UseMvcWithDefaultRouteAndArea();
        }
    }
}
using Meowv.Blog.Api.Filters;
using Meowv.Blog.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerUI;
using System;
using System.IO;
using System.Linq;
using Volo.Abp;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc.AntiForgery;
using Volo.Abp.AspNetCore.Mvc.ExceptionHandling;
using Volo.Abp.AspNetCore.Serilog;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace Meowv.Blog.Api
{
    [DependsOn(
        typeof(AbpAutofacModule),
        typeof(AbpAspNetCoreSerilogModule),
        typeof(AbpAspNetCoreMvcModule),
        typeof(MeowvBlogApplicationModule),
        typeof(MeowvBlogMongoDbModule)
    )]
    public class MeowvBlogApiModule : AbpModule
    {
        public SwaggerOptions SwaggerOptions { get; set; }

        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            SwaggerOptions = context.Services.ExecutePreConfiguredActions<SwaggerOptions>();

            ConfigureExceptionFilter();
            ConfigureAutoApiControllers();
            ConfigureAutoValidate();
            ConfigureRouting(context.Services);
            ConfigureSwaggerServices(context.Services);
        }

        private void ConfigureExceptionFilter()
        {
            Configure<MvcOptions>(options =>
            {
                var filterMetadata = options.Filters.FirstOrDefault(x => x is ServiceFilterAttribute attribute && attribute.ServiceType.Equals(typeof(AbpExceptionFilter)));
                options.Filters.Remove(filterMetadata);
                options.Filters.Add(typeof(MeowvBlogExceptionFilter));
            });
        }

        private void ConfigureAutoApiControllers()
        {
            Configure<AbpAspNetCoreMvcOptions>(options =>
            {
                options.ConventionalControllers.Create(typeof(MeowvBlogApplicationModule).Assembly, opts => { opts.RootPath = "meowv"; });
            });
        }

        private void ConfigureAutoValidate()
        {
            Configure<AbpAntiForgeryOptions>(options =>
            {
                options.AutoValidate = false;
            });
        }

        private static void ConfigureRouting(IServiceCollection services)
        {
            services.AddRouting(options =>
            {
                options.LowercaseUrls = true;
                options.AppendTrailingSlash = true;
            });
        }

        private void ConfigureSwaggerServices(IServiceCollection services)
        {
            services.AddSwaggerGen(options =>
            {
                //options.AddSecurityDefinition("oauth2", new OpenApiSecurityScheme
                //{
                //    Type = SecuritySchemeType.OAuth2,
                //    Flows = new OpenApiOAuthFlows
                //    {
                //        AuthorizationCode = new OpenApiOAuthFlow
                //        {
                //            AuthorizationUrl = new Uri("https://localhost:5001/connect/authorize"),
                //            Scopes = new Dictionary<string, string> { { "meowv_blog", "meowv_blog api" } },
                //            TokenUrl = new Uri("https://localhost:5001/connect/token")
                //        }
                //    }
                //});
                //options.AddSecurityRequirement(new OpenApiSecurityRequirement
                //{
                //    {
                //        new OpenApiSecurityScheme
                //        {
                //            Reference = new OpenApiReference
                //            {
                //                Type = ReferenceType.SecurityScheme,
                //                Id = "oauth2"
                //            }
                //        },
                //        Array.Empty<string>()
                //    }
                //});

                options.SwaggerDoc(SwaggerOptions.Name, new OpenApiInfo
                {
                    Title = SwaggerOptions.Title,
                    Version = SwaggerOptions.Version,
                    Description = SwaggerOptions.Description
                });
                options.DocInclusionPredicate((docName, description) => true);
                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "Meowv.Blog.Core.xml"));
                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "Meowv.Blog.Application.xml"));
                options.CustomSchemaIds(type => type.FullName);
                options.DocumentFilter<SwaggerDocumentFilter>();
            });
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var env = context.GetEnvironment();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseRouting();
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.HeadContent = @"<style>.opblock-summary-description{font-weight: bold;text-align: right;}</style>";
                options.SwaggerEndpoint($"/swagger/{SwaggerOptions.Name}/swagger.json", SwaggerOptions.Title);
                options.DefaultModelsExpandDepth(-1);
                options.DocExpansion(DocExpansion.List);
                options.RoutePrefix = SwaggerOptions.RoutePrefix;
                options.DocumentTitle = SwaggerOptions.DocumentTitle;
            });
            app.UseAuditing();
            app.UseAbpSerilogEnrichers();
            app.UseConfiguredEndpoints();
        }
    }
}
using Castle.Facilities.Logging;
using MeowvBlog.Core;
using MeowvBlog.EntityFrameworkCore;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using MeowvBlog.Web.Filter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Plus;
using Plus.Log4Net;
using Plus.Modules;
using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Unicode;

namespace MeowvBlog.Web
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddCors(options =>
            {
                options.AddPolicy("AllowAll", p => p.AllowAnyOrigin()
                                                    .AllowAnyMethod()
                                                    .AllowAnyHeader()
                                                    .AllowCredentials());
            });

            services.AddSingleton(HtmlEncoder.Create(UnicodeRanges.All));

            services.Configure<CookiePolicyOptions>(options =>
            {
                options.CheckConsentNeeded = context => true;
                options.MinimumSameSitePolicy = SameSiteMode.None;
            });

            services.AddMvc(options =>
            {
                options.Filters.Add<ActionParameterValidateAttribute>();
                options.Filters.Add<GlobalExceptionFilter>();
            });

            services.AddRouting(options =>
            {
                options.LowercaseUrls = true;
                options.AppendTrailingSlash = true;
            });

            services.AddSwaggerGen(options =>
            {
                var info = new Info
                {
                    Version = "v3.0.2",
                    Title = "MeowvBlog - 个人博客数据接口",
                    Description = "基于<code>.NET Core <a href='https://github.com/Meowv/.netcoreplus'>Plus</a></code>开发 ---- 个人博客数据接口列表 <a href='https://meowv.com'>https://meowv.com</a>"
                };
                options.SwaggerDoc("v1", info);
                options.DocumentFilter<TagDescriptionsFilter>();
            });

            PlusStarter.Create<MeowvBlogWebModule>(options =>
            {
                options.IocManager
                       .IocContainer
                       .AddFacility<LoggingFacility>(x => x.UseLog4Net()
                       .WithConfig("log4net.config"));
            }).Initialize();
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

            app.UseMvcWithDefaultRoute();
            app.UseStaticFiles();
            app.UseHttpsRedirection();

            app.UseCors(builder =>
            {
                builder.AllowAnyOrigin()
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials();
            });

            app.UseSwagger(s =>
            {
                s.PreSerializeFilters.Add((swaggerDoc, httpReq) =>
                {
                    swaggerDoc.Schemes = new[] { "https" };
                });
            });

            app.UseSwaggerUI(s =>
            {
                s.SwaggerEndpoint("/swagger/v1/swagger.json", "个人博客数据接口列表");

                s.DefaultModelExpandDepth(2);
                s.DefaultModelRendering(ModelRendering.Model);
                s.DefaultModelsExpandDepth(-1);
                s.DocExpansion(DocExpansion.None);
            });
        }
    }

    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(MeowvBlogServicesModule),
        typeof(MeowvBlogServicesDtoModule),
        typeof(MeowvBlogEntityFrameworkCoreModule)
    )]
    internal class MeowvBlogWebModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}
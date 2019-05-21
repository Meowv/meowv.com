using Castle.Facilities.Logging;
using MeowvBlog.Core;
using MeowvBlog.EntityFrameworkCore;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Plus;
using Plus.Dependency;
using Plus.Log4Net;
using Plus.Modules;
using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Unicode;
using System.Threading;

namespace MeowvBlog.Web
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public static readonly AsyncLocal<IocManager> IocManager = new AsyncLocal<IocManager>();

        public IConfiguration Configuration { get; }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddCors(options =>
            {
                options.AddPolicy("AllowAll", p => p.AllowAnyOrigin()
                                                    .AllowAnyMethod()
                                                    .AllowAnyHeader()
                                                    .AllowCredentials());
            });

            services.AddSingleton(Configuration);
            services.AddSingleton(HtmlEncoder.Create(UnicodeRanges.All));

            services.AddMvc(options =>
            {

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
                    Description = "基于<code>.NET Core</code>开发个人博客数据接口 <a href='https://mewov.com'>https://mewov.com</a>"
                };
                options.SwaggerDoc("v1", info);
                //options.DocumentFilter<>();
            });

            PlusStarter.Create<MeowvBlogWebModule>(options =>
            {
                options.IocManager = IocManager.Value ?? new IocManager();

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
                s.PreSerializeFilters.Add((swaggerDoc, httpReq) => swaggerDoc.Schemes = new[] { "https" });
            });

            app.UseSwaggerUI(s =>
            {
                s.SwaggerEndpoint("/swagger/v1/swagger.json", "个人博客数据接口列表");

                s.DefaultModelExpandDepth(2);
                s.DefaultModelRendering(ModelRendering.Model);
                s.DefaultModelsExpandDepth(-1);
                s.DocExpansion(DocExpansion.None);
            });

            app.UseMvcWithDefaultRoute();
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
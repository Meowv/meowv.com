using Castle.Facilities.Logging;
using MeowvBlog.API.Filters;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.IO;
using UPrime;
using UPrime.Castle.Log4Net;

namespace MeowvBlog.API
{
    public class Startup
    {
        public IConfiguration Configuration { get; }

        public Startup(IConfiguration configuration) => Configuration = configuration;

        /// <summary>
        /// 运行时调用此方法，使用此方法向容器添加服务
        /// </summary>
        /// <param name="services"></param>
        public void ConfigureServices(IServiceCollection services)
        {
            // Access-Control-Allow-Origin
            services.AddCors(options =>
            {
                options.AddPolicy("AllowAll", p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader().AllowCredentials());
            });

            services.AddSingleton(Configuration);

            services.AddMvc(options =>
            {
                // filters
                options.Filters.Add<ParameterValidateFilter>();
                options.Filters.Add<GlobalExceptionFilter>();
            });

            // 路由设置
            services.AddRouting(routes =>
            {
                routes.LowercaseUrls = true;
                routes.AppendTrailingSlash = false;
            });

            // Swagger配置
            services.AddSwaggerGen(options =>
            {
                options.SwaggerDoc("v1", new Info
                {
                    Version = "v1",
                    Title = "MeowvBlog API - 个人博客数据接口列表"
                });

                var path = Directory.GetCurrentDirectory();
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.API.xml"));
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.Core.xml"));
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.Services.Dto.xml"));
            });

            // 启动模块
            UPrimeStarter.Create<MeowvBlogAPIMoudle>(options =>
            {
                options.IocManager.IocContainer.AddFacility<LoggingFacility>(f => f.UseUpLog4Net().WithConfig("log4net.config"));
            }).Initialize();
        }

        /// <summary>
        /// 此方法由运行时调用，使用此方法配置HTTP请求管道
        /// </summary>
        /// <param name="app"></param>
        /// <param name="env"></param>
        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            app.UseCors(builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader().AllowCredentials());

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseMvcWithDefaultRoute();

            app.UseSwagger();
            app.UseSwaggerUI(s =>
            {
                s.SwaggerEndpoint("/swagger/v1/swagger.json", "MeowvBlog.API");

                s.DefaultModelExpandDepth(2);
                s.DefaultModelRendering(ModelRendering.Model);
                s.DefaultModelsExpandDepth(-1);
                s.DocExpansion(DocExpansion.None);
            });
        }
    }
}
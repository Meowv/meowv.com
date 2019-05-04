using Castle.Facilities.Logging;
using MeowvBlog.SOA.Filters;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.AzureAD.UI;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerUI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Encodings.Web;
using System.Text.Unicode;
using UPrime;
using UPrime.Castle.Log4Net;

namespace MeowvBlog.SOA
{
    public class Startup
    {
        public IConfiguration Configuration { get; }

        public Startup()
        {
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("uprimeSettings.json", optional: true, reloadOnChange: true);

            Configuration = builder.Build();
        }

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
            services.AddSingleton(HtmlEncoder.Create(UnicodeRanges.All));

            services.Configure<CookiePolicyOptions>(options =>
            {
                options.CheckConsentNeeded = context => true;
                options.MinimumSameSitePolicy = SameSiteMode.None;
            });

            services.AddAuthentication(AzureADDefaults.AuthenticationScheme)
                    .AddAzureAD(options => Configuration.Bind("AzureAd", options));

            services.Configure<OpenIdConnectOptions>(AzureADDefaults.OpenIdScheme, options =>
            {
                options.Authority += "/v2.0/";
                options.TokenValidationParameters.ValidateIssuer = false;
            });

            services.AddResponseCaching();

            services.AddMvc(options =>
            {
                var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();

                // filters
                options.Filters.Add<ParameterValidateFilter>();
                options.Filters.Add<GlobalExceptionFilter>();
                options.Filters.Add(new AuthorizeFilter(policy));

                // Cache
                options.CacheProfiles.Add("default", new CacheProfile
                {
                    Duration = 60 * 1// 1分钟
                });
                options.CacheProfiles.Add("Hourly", new CacheProfile
                {
                    Duration = 60 * 60//1小时
                });
            }).AddRazorPagesOptions(options =>
            {
                options.RootDirectory = "/Pages";
                options.Conventions.AddPageRoute("/Index", "/");
                options.Conventions.AddPageRoute("/Index", "index.html");
                options.Conventions.AddPageRoute("/Index", "/page/{p:int}");
                options.Conventions.AddPageRoute("/Detail", "/p/{id:int}.html");
                options.Conventions.AddPageRoute("/Category", "/category/list/{url}");
                options.Conventions.AddPageRoute("/Tags", "/tags");
                options.Conventions.AddPageRoute("/TagsList", "/tags/list/{url}");
                options.Conventions.AddPageRoute("/Search", "/search/{key}");
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
                    Version = "1.0.0",
                    Title = "MeowvBlog - 个人博客数据接口列表",
                    Description = "基于<code>.NET Core</code>开发个人博客数据接口<code>WebApi</code>，支持<code>MySQL</code>和<code>SqlServer</code>一键切换，现学现写，自娱自乐。<code><a href='https://mewov.com'>https://mewov.com</a></code>"
                });

                var path = Directory.GetCurrentDirectory();
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.SOA.xml"));
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.Core.xml"));
                options.IncludeXmlComments(Path.Combine(path, "MeowvBlog.Services.Dto.xml"));

                // 标签描述
                options.DocumentFilter<ApplyTagDescriptions>();
            });
           
            // 启动模块
            UPrimeStarter.Create<MeowvBlogSOAModule>(options =>
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

            app.UseDefaultFiles(new DefaultFilesOptions
            {
                DefaultFileNames = new List<string> { "index.html" }
            });

            app.UseStaticFiles(new StaticFileOptions
            {
                OnPrepareResponse = context =>
                {
                    context.Context.Response.GetTypedHeaders().CacheControl = new Microsoft.Net.Http.Headers.CacheControlHeaderValue
                    {
                        Public = true,
                        MaxAge = TimeSpan.FromDays(365)
                    };
                }
            });

            app.UseHttpsRedirection();
            app.UseCookiePolicy();
            app.UseAuthentication();
            app.UseResponseCaching();

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
}
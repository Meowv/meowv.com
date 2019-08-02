using Castle.Facilities.Logging;
using MeowvBlog.Core;
using MeowvBlog.EntityFrameworkCore;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using MeowvBlog.Web.Filters;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Plus;
using Plus.Log4Net;
using Plus.Modules;
using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.IO;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Unicode;

namespace MeowvBlog.Web
{
    public class Startup
    {
        public IConfiguration Configuration { get; }

        public Startup()
        {
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

            Configuration = builder.Build();
        }

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

            services.AddResponseCaching();

            services.AddRouting(options =>
            {
                options.LowercaseUrls = true;
                options.AppendTrailingSlash = true;
            });

            services.Configure<CookiePolicyOptions>(options =>
            {
                options.CheckConsentNeeded = context => true;
                options.MinimumSameSitePolicy = SameSiteMode.None;
            });

            services.AddAuthentication(options =>
            {
                options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            }).AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, x =>
            {
                x.LoginPath = "/account/auth";
            });

            services.AddSession();

            services.AddMvc(options =>
            {
                var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
                options.Filters.Add(new AuthorizeFilter(policy));

                options.Filters.Add<ActionParameterValidateAttribute>();
                options.Filters.Add<GlobalExceptionFilter>();

                options.CacheProfiles.Add("default", new CacheProfile { Duration = 60 });

            }).SetCompatibilityVersion(CompatibilityVersion.Version_2_2);

            services.AddSwaggerGen(options =>
            {
                var basePath = Directory.GetCurrentDirectory();
                var info = new Info
                {
                    Version = "v3.0.2",
                    Title = "阿星Plus - 个人博客以及通用数据接口",
                    Description = @"框架：<code>.NET Core 2.2</code>、<a href='https://github.com/Meowv/.netcoreplus'>.netcoreplus</a>
                                    博客：https://meowv.com
                                    开源：https://github.com/Meowv/Blog"
                };
                options.SwaggerDoc("v1", info);
                options.DocumentFilter<TagDescriptionsFilter>();
                options.IncludeXmlComments(Path.Combine(basePath, "MeowvBlog.Core.xml"));
                options.IncludeXmlComments(Path.Combine(basePath, "MeowvBlog.Services.Dto.xml"));
                options.IncludeXmlComments(Path.Combine(basePath, "MeowvBlog.Web.xml"));
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

            app.UseCors(builder =>
            {
                builder.AllowAnyOrigin()
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials();
            });

            app.UseStaticFiles();
            app.UseHttpsRedirection();
            app.UseCookiePolicy();
            app.UseResponseCaching();
            app.UseAuthentication();
            app.UseMvcWithDefaultRoute();
            
            app.UseSwagger();
            app.UseSwaggerUI(s =>
            {
                s.SwaggerEndpoint("/swagger/v1/swagger.json", "个人博客以及通用数据接口");

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
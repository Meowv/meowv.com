using MeowvBlog.API.Configurations;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Jobs;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Swagger;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.Web
{
    public class Program
    {
        /// <summary>
        /// Main方法，程序入口
        /// </summary>
        /// <param name="args"></param>
        /// <returns></returns>
        public static async Task Main(string[] args)
        {
            // 初始化并监听端口5002，配合Nginx端口转发
            await Host.CreateDefaultBuilder(args)
                      .ConfigureWebHostDefaults(builder =>
                      {
                          builder.ConfigureKestrel(options => { options.AddServerHeader = false; })
                                 .UseUrls("http://*:5002")
                                 .UseStartup<Program>();
                      }).Build().RunAsync();
        }

        /// <summary>
        /// This method gets called by the runtime. Use this method to add services to the container.
        /// </summary>
        /// <param name="services"></param>
        public void ConfigureServices(IServiceCollection services)
        {
            // 注入控制器，且让其支持NewtonsoftJson
            services.AddControllers().AddNewtonsoftJson();
            // 注入Sqlite数据库上下文
            services.AddDbContext<MeowvBlogDBContext>();
            // 注入基于BackgroundService的简单定时任务
            services.AddTransient<IHostedService, RemindJob>();
            // 路由配置
            services.AddRouting(options =>
            {
                // 设置URL为小写
                options.LowercaseUrls = true;
                // 在生成的URL后面添加斜杠
                options.AppendTrailingSlash = true;
            });
            // Swagger扩展
            services.AddSwagger();
            // 身份验证之JWT
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                    .AddJwtBearer(options =>
                    {
                        options.TokenValidationParameters = new TokenValidationParameters
                        {
                            // 是否验证颁发者
                            ValidateIssuer = true,
                            // 是否验证访问群体
                            ValidateAudience = true,
                            // 是否验证生存期
                            ValidateLifetime = true,
                            // 验证Token的时间偏移量
                            ClockSkew = TimeSpan.FromSeconds(30),
                            // 是否验证安全密钥
                            ValidateIssuerSigningKey = true,
                            // 访问群体
                            ValidAudience = AppSettings.JWT.Domain,
                            // 颁发者
                            ValidIssuer = AppSettings.JWT.Domain,
                            // 安全密钥
                            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AppSettings.JWT.SecurityKey))
                        };
                    });
            // 认证授权
            services.AddAuthorization();
            // 添加响应缓存
            services.AddResponseCaching();
            // MVC服务
            services.AddMvcCore(options =>
            {
                // 添加一条响应缓存的默认配置
                options.CacheProfiles.Add("default", new CacheProfile { Duration = 100 });
            }).SetCompatibilityVersion(CompatibilityVersion.Latest);
            // Http请求
            services.AddHttpClient();
        }

        /// <summary>
        /// This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        /// </summary>
        /// <param name="app"></param>
        /// <param name="env"></param>
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // 环境变量，开发环境
            if (env.IsDevelopment())
            {
                // 生成异常页面
                app.UseDeveloperExceptionPage();
            }
            
            // 使用HSTS的中间件，该中间件添加了严格传输安全头
            app.UseHsts();
            // 将一个内嵌定义的中间件委托添加到应用程序的请求管道中，将判断是否授权
            app.Use(async (context, next) =>
            {
                await next();
                if (context.Response.StatusCode == (int)HttpStatusCode.Unauthorized)
                {
                    var response = new Response { Msg = "Unauthorized" };
                    var content = JsonConvert.SerializeObject(response, Formatting.None, new JsonSerializerSettings
                    {
                        ContractResolver = new CamelCasePropertyNamesContractResolver()
                    });
                    await context.Response.WriteAsync(content);
                }
            });
            // 转发将标头代理到当前请求，配合 Nginx 使用，获取用户真实IP
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });
            // 路由
            app.UseRouting();
            // 响应缓存
            app.UseResponseCaching();
            // 跨域
            app.UseCors();
            // 身份验证
            app.UseAuthentication();
            // 认证授权
            app.UseAuthorization();
            // HTTP => HTTPS
            app.UseHttpsRedirection();
            // Swagger
            app.UseSwagger();
            // SwaggerUI
            app.UseSwaggerUI();
            // 路由映射
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
}
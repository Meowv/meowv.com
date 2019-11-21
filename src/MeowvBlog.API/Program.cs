using MeowvBlog.API.Configurations;
using MeowvBlog.API.Infrastructure;
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
        public static async Task Main(string[] args)
        {
            await Host.CreateDefaultBuilder(args)
                      .ConfigureWebHostDefaults(builder =>
                      {
                          builder.ConfigureKestrel(options => { options.AddServerHeader = false; })
                                 .UseUrls("http://*:5002")
                                 .UseStartup<Program>();
                      }).Build().RunAsync();
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllers().AddNewtonsoftJson();
            services.AddDbContext<MeowvBlogDBContext>();
            services.AddRouting(options =>
            {
                options.LowercaseUrls = true;
                options.AppendTrailingSlash = true;
            });
            services.AddSwagger();
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                    .AddJwtBearer(options =>
                    {
                        options.TokenValidationParameters = new TokenValidationParameters
                        {
                            ValidateIssuer = true,
                            ValidateAudience = true,
                            ValidateLifetime = true,
                            ClockSkew = TimeSpan.FromSeconds(30),
                            ValidateIssuerSigningKey = true,
                            ValidAudience = AppSettings.JWT.Domain,
                            ValidIssuer = AppSettings.JWT.Domain,
                            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AppSettings.JWT.SecurityKey))
                        };
                    });
            services.AddAuthorization();
            services.AddResponseCaching();
            services.AddMemoryCache();
            services.AddMvcCore(options =>
            {
                options.CacheProfiles.Add("default", new CacheProfile { Duration = 100 });
            }).SetCompatibilityVersion(CompatibilityVersion.Version_3_0);
            services.AddHttpClient();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseHsts();
            }

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

            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });
            app.UseRouting();
            app.UseResponseCaching();
            app.UseCors();
            app.UseAuthentication();
            app.UseAuthorization();
            app.UseHttpsRedirection();
            app.UseSwagger();
            app.UseSwaggerUI();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
}
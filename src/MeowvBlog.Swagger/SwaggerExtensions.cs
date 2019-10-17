using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;
using System;
using System.IO;

namespace MeowvBlog.Swagger
{
    public static class SwaggerExtensions
    {
        public static IServiceCollection AddSwagger(this IServiceCollection services)
        {
            return services.AddSwaggerGen(options =>
            {
                var info = new OpenApiInfo
                {
                    Version = "v3.1.0",
                    Title = "阿星Plus - 个人博客以及通用接口"
                };
                options.SwaggerDoc("v1", info);
                options.DocumentFilter<SwaggerDocumentFilter>();

                options.AddSecurityDefinition("ApiKey", new OpenApiSecurityScheme
                {
                    Description = "JWT模式授权，请输入 Bearer {Token} 进行身份验证",
                    Name = "Authorization",
                    In = ParameterLocation.Header,
                    Type = SecuritySchemeType.ApiKey
                });

                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "MeowvBlog.Web.xml"));
                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "MeowvBlog.Core.xml"));
            });
        }

        public static void UseSwaggerUI(this IApplicationBuilder app)
        {
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "个人博客以及通用接口");
                c.RoutePrefix = string.Empty;
            });
        }
    }
}
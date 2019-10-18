using MeowvBlog.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.Filters;
using System;
using System.Collections.Generic;
using System.IO;

namespace MeowvBlog.API.Swagger
{
    public static class SwaggerExtensions
    {
        public static List<SwaggerApiInfo> ApiInfos = new List<SwaggerApiInfo>()
        {
            new SwaggerApiInfo
            {
                UrlPrefix = GlobalConsts.GroupName_v1,
                Name = "博客前台接口",
                OpenApiInfo = new OpenApiInfo
                {
                    Version = "v3.1.0",
                    Title = "阿星Plus - 博客前台接口"
                }
            },
            new SwaggerApiInfo
            {
                UrlPrefix = GlobalConsts.GroupName_v2,
                Name = "博客后台接口",
                OpenApiInfo = new OpenApiInfo
                {
                    Version = "v3.1.0",
                    Title = "阿星Plus - 博客后台接口"
                }
            },
            new SwaggerApiInfo
            {
                UrlPrefix = GlobalConsts.GroupName_v3,
                Name = "其他通用接口",
                OpenApiInfo = new OpenApiInfo
                {
                    Version = "v3.1.0",
                    Title = "阿星Plus - 其他通用接口"
                }
            }
        };

        public static IServiceCollection AddSwagger(this IServiceCollection services)
        {
            return services.AddSwaggerGen(options =>
            {
                ApiInfos.ForEach(x =>
                {
                    options.SwaggerDoc(x.UrlPrefix, x.OpenApiInfo);
                });

                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "MeowvBlog.API.xml"));
                options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "MeowvBlog.Core.xml"));

                var security = new OpenApiSecurityScheme
                {
                    Description = "JWT模式授权，请输入 Bearer {Token} 进行身份验证",
                    Name = "Authorization",
                    In = ParameterLocation.Header,
                    Type = SecuritySchemeType.ApiKey
                };
                options.AddSecurityDefinition("oauth2", security);
                options.AddSecurityRequirement(new OpenApiSecurityRequirement {
                    { security, new List<string>() }
                });

                options.DocumentFilter<SwaggerDocumentFilter>();

                options.OperationFilter<AddResponseHeadersFilter>();
                options.OperationFilter<AppendAuthorizeToSummaryOperationFilter>();
                options.OperationFilter<SecurityRequirementsOperationFilter>();
            });
        }

        public static void UseSwaggerUI(this IApplicationBuilder app)
        {
            app.UseSwaggerUI(options =>
            {
                ApiInfos.ForEach(x =>
                {
                    options.SwaggerEndpoint($"/swagger/{x.UrlPrefix}/swagger.json", x.Name);
                });
                options.RoutePrefix = string.Empty;
            });
        }
    }
}
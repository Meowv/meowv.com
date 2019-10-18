using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;

namespace MeowvBlog.API.Swagger
{
    public class SwaggerDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            var tags = new List<OpenApiTag>
            {
                new OpenApiTag {
                    Name = "Blog",
                    Description = "    个人博客相关接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "文章/标签/分类/友链/RSS" }
                },
                new OpenApiTag {
                    Name = "Auth",
                    Description = "    JWT模式认证授权",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Token" }
                }
            };

            swaggerDoc.Tags = tags;
        }
    }
}
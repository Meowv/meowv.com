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
                    Description = "    博客前台接口，包含文章、标签、分类的查询"
                },
                new OpenApiTag
                {
                    Name = "BlogAdmin",
                    Description = "    博客后台接口，包含文章、标签、分类的创建、编辑、删除"
                }
            };

            swaggerDoc.Tags = tags;
        }
    }
}
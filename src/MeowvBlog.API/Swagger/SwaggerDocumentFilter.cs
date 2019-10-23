using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;
using System.Linq;

namespace MeowvBlog.API.Swagger
{
    public class SwaggerDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            var tags = new List<OpenApiTag>
            {
                new OpenApiTag {
                    Name = "Auth",
                    Description = "JWT模式认证授权",
                    ExternalDocs = new OpenApiExternalDocs { Description = "JSON Web Token" }
                },
                new OpenApiTag {
                    Name = "Blog",
                    Description = "个人博客相关接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "文章/标签/分类/友链/RSS" }
                },
                new OpenApiTag {
                    Name = "Common",
                    Description = "通用公共接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "微信分享/Bing壁纸/随机一张猫图" }
                },
                new OpenApiTag {
                    Name = "MTA",
                    Description = "腾讯移动分析",
                    ExternalDocs = new OpenApiExternalDocs { Description = "MTA" }
                },
                new OpenApiTag {
                    Name = "Signature",
                    Description = "个性艺术签名设计",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Signature" }
                }
            };

            swaggerDoc.Tags = tags.OrderBy(x => x.Name).ToList();
        }
    }
}
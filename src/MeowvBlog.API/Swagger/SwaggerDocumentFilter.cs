using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;
using System.Linq;

namespace MeowvBlog.API.Swagger
{
    /// <summary>
    /// 对应Controller的API文档描述信息
    /// </summary>
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
                    ExternalDocs = new OpenApiExternalDocs { Description = "每日热点/Bing壁纸/妹子图/随机一张猫图/语音合成/智能抠图" }
                },
                new OpenApiTag {
                    Name = "MTA",
                    Description = "腾讯移动分析",
                    ExternalDocs = new OpenApiExternalDocs { Description = "MTA" }
                },
                new OpenApiTag {
                    Name = "TCA",
                    Description = "腾讯云API",
                    ExternalDocs = new OpenApiExternalDocs { Description = "CDN刷新/验证码校验" }
                },
                new OpenApiTag {
                    Name = "Signature",
                    Description = "个性艺术签名设计",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Signature" }
                },
                new OpenApiTag {
                    Name = "Gallery",
                    Description = "图集相册",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Gallery" }
                },
                new OpenApiTag {
                    Name = "Soul",
                    Description = "心灵/毒 鸡汤",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Soul" }
                },
                new OpenApiTag {
                    Name = "FM",
                    Description = "FM电台",
                    ExternalDocs = new OpenApiExternalDocs { Description = "FM" }
                },
                new OpenApiTag {
                    Name = "Wallpaper",
                    Description = "壁纸",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Wallpaper" }
                }
            };

            // 按照Name升序排序
            swaggerDoc.Tags = tags.OrderBy(x => x.Name).ToList();
        }
    }
}
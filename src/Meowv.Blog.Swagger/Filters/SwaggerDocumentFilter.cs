using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Meowv.Blog.Swagger.Filters
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
                    ExternalDocs = new OpenApiExternalDocs { Description = "包含：文章/标签/分类/友链" }
                },
                new OpenApiTag {
                    Name = "Signature",
                    Description = "个性艺术签名设计",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Signature" }
                },
                new OpenApiTag {
                    Name = "Wallpaper",
                    Description = "手机壁纸接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Wallpaper" }
                },
                new OpenApiTag
                {
                    Name = "HotNews",
                    Description = "每日热点接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "每日热点来源和列表" }
                },
                new OpenApiTag {
                    Name = "Common",
                    Description = "通用公共接口",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Bing壁纸/妹子图/猫咪图/智能抠图/语音合成" }
                },
                new OpenApiTag {
                    Name = "MTA",
                    Description = "腾讯移动分析",
                    ExternalDocs = new OpenApiExternalDocs { Description = "MTA" }
                },
                new OpenApiTag {
                    Name = "TCA",
                    Description = "腾讯云API",
                    ExternalDocs = new OpenApiExternalDocs { Description = "CDN/Captcha" }
                },
                new OpenApiTag {
                    Name = "Soul",
                    Description = "心灵/毒 鸡汤",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Soul" }
                },
                new OpenApiTag {
                    Name = "Gallery",
                    Description = "图集相册",
                    ExternalDocs = new OpenApiExternalDocs { Description = "Gallery" }
                },
                new OpenApiTag {
                    Name = "FM",
                    Description = "FM电台",
                    ExternalDocs = new OpenApiExternalDocs { Description = "FM" }
                }
            };

            #region 实现添加自定义描述时过滤不属于同一个分组的API

            // 当前分组名称
            var groupName = context.ApiDescriptions.FirstOrDefault().GroupName;

            // 当前所有的API对象
            var apis = context.ApiDescriptions.GetType().GetField("_source", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(context.ApiDescriptions) as IEnumerable<ApiDescription>;

            // 不属于当前分组的所有Controller
            // 注意：配置的OpenApiTag，Name名称要与Controller的Name对应才会生效。
            var controllers = apis.Where(x => x.GroupName != groupName).Select(x => ((ControllerActionDescriptor)x.ActionDescriptor).ControllerName).Distinct();

            // 筛选一下tags
            swaggerDoc.Tags = tags.Where(x => !controllers.Contains(x.Name)).OrderBy(x => x.Name).ToList();

            #endregion
        }
    }
}
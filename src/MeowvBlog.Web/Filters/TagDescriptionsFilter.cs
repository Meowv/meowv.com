using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;

namespace MeowvBlog.Web.Filters
{
    public class TagDescriptionsFilter : IDocumentFilter
    {
        public void Apply(SwaggerDocument swaggerDoc, DocumentFilterContext context)
        {
            var tags = new List<Tag>
            {
                new Tag
                {
                    Name = "Blog",
                    Description = "个人博客接口"
                },
                new Tag
                {
                    Name = "Account",
                    Description = "Account验证接口"
                },
                new Tag
                {
                    Name = "MTA",
                    Description = "腾讯MTA网站数据分析接口"
                },
                new Tag
                {
                    Name = "Sign",
                    Description = "个性签名接口"
                }
            };

            swaggerDoc.Tags = tags;
        }
    }
}
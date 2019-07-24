using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;

namespace MeowvBlog.Web.Filter
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
                }
            };

            swaggerDoc.Tags = tags;
        }
    }
}
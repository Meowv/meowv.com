using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;

namespace MeowvBlog.API.Filters
{
    public class ApplyTagDescriptions : IDocumentFilter
    {
        public void Apply(SwaggerDocument swaggerDoc, DocumentFilterContext context)
        {
            swaggerDoc.Tags = new List<Tag>
            {
                new Tag
                {
                    Name = "Article",
                    Description = "文章相关API"
                },
                new Tag
                {
                    Name = "Category",
                    Description = "分类相关API"
                },
                new Tag
                {
                    Name = "Tag",
                    Description = "标签相关API"
                },
                new Tag
                {
                    Name= "ExcelHandler",
                    Description = "Excel处理API"
                }
            };
        }
    }
}

using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Linq;

namespace Meowv.Blog.Api.Filters
{
    public class SwaggerDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            //var tags = new List<OpenApiTag>
            //{
            //    new OpenApiTag { Name = "User", Description = "<code>用户模块</code>" },
            //};

            //swaggerDoc.Tags = tags;

            var apis = context.ApiDescriptions.Where(x => x.RelativePath.Contains("abp"));
            if (apis.Any())
            {
                foreach (var item in apis)
                {
                    swaggerDoc.Paths.Remove("/" + item.RelativePath);
                }
            }
        }
    }
}
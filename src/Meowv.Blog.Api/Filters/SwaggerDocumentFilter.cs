using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;
using System.Linq;

namespace Meowv.Blog.Api.Filters
{
    public class SwaggerDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            context.ApiDescriptions.Where(x => x.RelativePath.Contains("abp")).ToList()?.ForEach(x => swaggerDoc.Paths.Remove("/" + x.RelativePath));

            var tags = new List<OpenApiTag>
            {
                new OpenApiTag { Name = "Blog", Description = "<code>The blog module.</code>" },
            };

            swaggerDoc.Tags = tags;
        }
    }
}
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
                new OpenApiTag { Name = "Authorize", Description = "<code>The authorize module.</code>" },
                new OpenApiTag { Name = "Blog", Description = "<code>The blog module.</code>" },
                new OpenApiTag { Name = "Tool", Description = "<code>The tool module.</code>" },
                new OpenApiTag { Name = "Hot", Description = "<code>The hots module.</code>" },
                new OpenApiTag { Name = "Message", Description = "<code>The message module.</code>" },
                new OpenApiTag { Name = "Saying", Description = "<code>The sayings module.</code>" },
                new OpenApiTag { Name = "Signature", Description = "<code>The signature module.</code>" },
                new OpenApiTag { Name = "User", Description = "<code>The user module.</code>" }
            };

            swaggerDoc.Tags = tags;
        }
    }
}
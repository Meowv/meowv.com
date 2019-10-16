using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;

namespace MeowvBlog.Web
{
    public class DocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            var tags = new List<OpenApiTag>
            {
                new OpenApiTag { Name = "WeatherForecast", Description = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",ExternalDocs=new OpenApiExternalDocs{ Description="AAAAAAAAAAAAAAAAAAAAAAAAA"} },
            };

            swaggerDoc.Tags = tags;
        }
    }
}
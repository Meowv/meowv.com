using Microsoft.OpenApi.Models;

namespace MeowvBlog.API.Swagger
{
    public class SwaggerApiInfo
    {
        public string UrlPrefix { get; set; }

        public string Name { get; set; }

        public OpenApiInfo OpenApiInfo { get; set; }
    }
}
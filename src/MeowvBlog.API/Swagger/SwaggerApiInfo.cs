using Microsoft.OpenApi.Models;

namespace MeowvBlog.API.Swagger
{
    public class SwaggerApiInfo
    {
        /// <summary>
        /// URL前缀
        /// </summary>
        public string UrlPrefix { get; set; }

        /// <summary>
        /// 名称
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// <see cref="Microsoft.OpenApi.Models.OpenApiInfo"/>
        /// </summary>
        public OpenApiInfo OpenApiInfo { get; set; }
    }
}
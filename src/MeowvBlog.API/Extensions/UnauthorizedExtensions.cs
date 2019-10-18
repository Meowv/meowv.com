using MeowvBlog.Core.Dto;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Net;

namespace MeowvBlog.API.Middlewares
{
    public static class UnauthorizedExtensions
    {
        public static IApplicationBuilder UseUnAuthorizedHandler(this IApplicationBuilder app)
        {
            return app.Use(async (context, next) =>
            {
                await next();
                if (context.Response.StatusCode == (int)HttpStatusCode.Unauthorized)
                {
                    var response = new Response { Msg = "Unauthorized" };
                    var content = JsonConvert.SerializeObject(response, Formatting.None, new JsonSerializerSettings
                    {
                        ContractResolver = new CamelCasePropertyNamesContractResolver()
                    });
                    await context.Response.WriteAsync(content);
                }
            });
        }
    }
}
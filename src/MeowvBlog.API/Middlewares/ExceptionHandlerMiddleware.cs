using MeowvBlog.Core.Dto;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Threading.Tasks;

namespace MeowvBlog.API.Middlewares
{
    public class ExceptionHandlerMiddleware
    {
        private readonly RequestDelegate _next;

        public ExceptionHandlerMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task Invoke(HttpContext context)
        {
            await _next.Invoke(context);
            await HandleException(context);
        }

        private static Task HandleException(HttpContext context)
        {
            var response = new Response { Msg = "Unauthorized" };
            context.Response.ContentType = "application/json;";
            var content = JsonConvert.SerializeObject(response, Formatting.None, new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver()
            });
            return context.Response.WriteAsync(content);
        }
    }
}
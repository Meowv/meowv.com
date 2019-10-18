using Microsoft.AspNetCore.Builder;

namespace MeowvBlog.API.Middlewares
{
    public static class ExceptionHandlerMiddlewareExtensions
    {
        public static IApplicationBuilder UseAuthorizedHandler(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware(typeof(ExceptionHandlerMiddleware));
        }
    }
}
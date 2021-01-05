using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Meowv.Blog.Api.Filters
{
    public class MeowvBlogExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext context)
        {
            if (context.Exception != null)
            {
                var result = new BlogResponse();
                result.IsFailed(context.Exception.Message);

                context.Result = new ContentResult()
                {
                    Content = result.SerializeToJson(),
                    StatusCode = StatusCodes.Status200OK
                };

                context.ExceptionHandled = true;
            }
        }
    }
}
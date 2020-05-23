using Meowv.Blog.ToolKits.Helper;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Meowv.Blog.HttpApi.Hosting.Filters
{
    public class MeowvBlogExceptionFilter : IExceptionFilter
    {
        /// <summary>
        /// 异常处理
        /// </summary>
        /// <param name="context"></param>
        /// <returns></returns>
        public void OnException(ExceptionContext context)
        {
            // 日志记录
            LoggerHelper.WriteToFile($"{context.HttpContext.Request.Path}|{context.Exception.Message}", context.Exception);
        }
    }
}
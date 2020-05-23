using Microsoft.AspNetCore.Mvc.Filters;
using System.Threading.Tasks;

namespace Meowv.Blog.HttpApi.Hosting.Filters
{
    public class MeowvBlogExceptionFilter : IAsyncExceptionFilter
    {
        /// <summary>
        /// 异常处理
        /// </summary>
        /// <param name="context"></param>
        /// <returns></returns>
        public Task OnExceptionAsync(ExceptionContext context)
        {
            // 在这里做异常日志记录
            throw new System.NotImplementedException();
        }
    }
}
using Meowv.Api.Core;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Meowv.Api.Infrastructure;

/// <summary>管理凭据不得通过 URL 查询参数传递；等价复刻 QQ 设置组的 EndpointFilter。</summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class NoQueryManagementTokenAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (ApiCredentials.ReadManagementToken(context.HttpContext.Request).FromQuery)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedResult();
            return;
        }
        await next();
    }
}

using Microsoft.AspNetCore.Mvc.Filters;

namespace Meowv.Api.Platform.Security;

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
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (!context.Request.Path.StartsWithSegments("/api/studio"))
        {
            await _default.HandleAsync(next, context, policy, authorizeResult);
            return;
        }

        if (authorizeResult.Challenged)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsJsonAsync(
                new StudioApiError("请先登录。", StudioErrorCodes.Unauthorized, context.Items[StudioRequestIdMiddleware.ItemKey] as string),
                StudioJson.Options,
                context.RequestAborted);
            return;
        }

        if (authorizeResult.Forbidden)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsJsonAsync(
                new StudioApiError("没有权限执行该操作。", StudioErrorCodes.Forbidden, context.Items[StudioRequestIdMiddleware.ItemKey] as string),
                StudioJson.Options,
                context.RequestAborted);
            return;
        }

        await _default.HandleAsync(next, context, policy, authorizeResult);
    }
}
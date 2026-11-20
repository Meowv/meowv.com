using Meowv.Api.Core;
using Meowv.Api.Security;

namespace Meowv.Api.Modules.Auth;

public sealed class AuthModule : IEndpointModule
{
    public string Name => "auth";
    public string Description => "应用授权码管理。";

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/setup", (HttpContext context) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                return Results.Content(AuthSetupPage.Html, "text/html; charset=utf-8");
            })
            .WithSummary("服务初始化页面，用于写入管理密钥与通用授权码。")
            .AllowAnonymous();

        var group = endpoints.MapGroup("/api/auth")
            .RequireCors(ApiAuthorization.CorsPolicy)
            .RequireAuthorization(ApiAuthorization.ManagementPolicy);

        group.MapPost("/access-code", (HttpContext context, IAccessCodeService codes) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                return Results.Json(new AccessCodeResponse(codes.CreateIfMissing()), AuthJsonContext.Default.AccessCodeResponse);
            })
            .WithSummary("创建或读取当前通用授权码，重复调用返回同一个值。")
            .RequireRateLimiting("setup-ui");
        group.MapPost("/access-code/rotate", (HttpContext context, IAccessCodeService codes) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                return Results.Json(new AccessCodeResponse(codes.Rotate()), AuthJsonContext.Default.AccessCodeResponse);
            })
            .WithSummary("轮换通用授权码，旧授权码立即失效。")
            .RequireRateLimiting("api-auth");
    }
}
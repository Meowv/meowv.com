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
            .AllowAnonymous();

        var group = endpoints.MapGroup("/api/auth")
            .RequireCors(ApiAuthorization.CorsPolicy)
            .RequireAuthorization(ApiAuthorization.ManagementPolicy)
            .RequireRateLimiting("api-auth");

        group.MapPost("/access-code", (HttpContext context, IAccessCodeService codes) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Json(new AccessCodeResponse(codes.CreateIfMissing()), AuthJsonContext.Default.AccessCodeResponse);
        });
        group.MapPost("/access-code/rotate", (HttpContext context, IAccessCodeService codes) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Json(new AccessCodeResponse(codes.Rotate()), AuthJsonContext.Default.AccessCodeResponse);
        });
    }
}
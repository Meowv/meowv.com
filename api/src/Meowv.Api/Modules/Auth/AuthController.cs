using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Auth;

[ApiController]
[EndpointModule("auth")]
public sealed class AuthController : ControllerBase
{
    [HttpGet("/setup")]
    [AllowAnonymous]
    [EndpointSummary("服务初始化页面，用于写入管理密钥与通用授权码。")]
    public IResult Setup()
    {
        HttpContext.Response.Headers.CacheControl = "no-store";
        return Results.Content(AuthSetupPage.Html, "text/html; charset=utf-8");
    }

    [HttpPost("/api/auth/access-code")]
    [EnableCors(ApiAuthorization.CorsPolicy)]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [EnableRateLimiting("setup-ui")]
    [EndpointSummary("创建或读取当前通用授权码，重复调用返回同一个值。")]
    public IResult AccessCode([FromServices] IAccessCodeService codes)
    {
        HttpContext.Response.Headers.CacheControl = "no-store";
        return Results.Json(new AccessCodeResponse(codes.CreateIfMissing()), AuthJsonContext.Default.AccessCodeResponse);
    }

    [HttpPost("/api/auth/access-code/rotate")]
    [EnableCors(ApiAuthorization.CorsPolicy)]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("轮换通用授权码，旧授权码立即失效。")]
    public IResult Rotate([FromServices] IAccessCodeService codes)
    {
        HttpContext.Response.Headers.CacheControl = "no-store";
        return Results.Json(new AccessCodeResponse(codes.Rotate()), AuthJsonContext.Default.AccessCodeResponse);
    }
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

[ApiController]
[EndpointModule("studio", OptionsType = typeof(StudioOptions))]
public sealed class StudioAuthController(StudioAuthService auth, IStudioStore store, IStudioEmailSender email, StudioOptions options) : StudioControllerBase
{
    [HttpGet("/api/studio/auth/config")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("读取登录页所需的注册与邮件能力。")]
    public async Task<IResult> Config(CancellationToken cancellationToken)
    {
        var users = await store.CountUsersAsync(cancellationToken);
        return Results.Json(new StudioAuthCapabilitiesResponse
        {
            RegistrationEnabled = options.RegistrationEnabled,
            EmailVerificationRequired = options.RequireEmailVerification,
            MailConfigured = email.IsConfigured,
            PasswordMinLength = StudioAccountRules.PasswordMinLength,
            UsernameMinLength = StudioAccountRules.UsernameMinLength,
            UsernameMaxLength = StudioAccountRules.UsernameMaxLength,
            UserCount = users
        }, StudioJson.Options);
    }

    [HttpPost("/api/studio/auth/register")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("注册账号；开启邮箱验证时先发送验证邮件。")]
    public async Task<IResult> Register([FromBody] StudioRegisterRequest request, CancellationToken cancellationToken)
    {
        var result = await auth.RegisterAsync(request.Username, request.Email, request.Password, Request.Headers.UserAgent.ToString(), cancellationToken);

        return StudioResults.From(result, HttpContext, outcome => Results.Json(new StudioRegisterResponse
        {
            RequiresVerification = outcome.RequiresVerification,
            Token = outcome.Session?.Token,
            ExpiresAt = outcome.Session?.ExpiresAt,
            User = outcome.Session is null ? null : StudioUserProfileResponse.From(outcome.Session.User),
            Message = outcome.RequiresVerification ? "验证邮件已发送，请查收后完成验证。" : "注册成功。"
        }, StudioJson.Options, statusCode: StatusCodes.Status201Created));
    }

    [HttpPost("/api/studio/auth/login")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("使用用户名或邮箱登录，返回 Studio Bearer 令牌。")]
    public async Task<IResult> Login([FromBody] StudioLoginRequest request, CancellationToken cancellationToken)
    {
        var clientKey = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var result = await auth.LoginAsync(request.Identifier, request.Password, clientKey, Request.Headers.UserAgent.ToString(), cancellationToken);

        return StudioResults.From(result, HttpContext, session => Results.Json(new StudioAuthSessionResponse
        {
            Token = session.Token,
            ExpiresAt = session.ExpiresAt,
            User = StudioUserProfileResponse.From(session.User)
        }, StudioJson.Options));
    }

    [HttpPost("/api/studio/auth/logout")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("撤销当前会话。")]
    public async Task<IResult> Logout(CancellationToken cancellationToken)
    {
        var tokenId = StudioCurrentUser.TokenId(User);
        if (tokenId is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var result = await auth.LogoutAsync(tokenId, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("已退出登录。"), StudioJson.Options));
    }

    [HttpPost("/api/studio/auth/verify-email")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("使用邮件中的一次性令牌验证邮箱。")]
    public async Task<IResult> VerifyEmail([FromBody] StudioVerifyEmailRequest request, CancellationToken cancellationToken)
    {
        var result = await auth.VerifyEmailAsync(request.Token, cancellationToken);
        return StudioResults.From(result, HttpContext, user => Results.Json(new StudioVerifyEmailResponse
        {
            Message = "邮箱验证成功。",
            User = StudioUserProfileResponse.From(user)
        }, StudioJson.Options));
    }

    [HttpPost("/api/studio/auth/resend-verification")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("重新发送邮箱验证邮件。")]
    public async Task<IResult> ResendVerification(CancellationToken cancellationToken)
    {
        var userId = StudioCurrentUser.Id(User);
        if (userId is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var result = await auth.ResendVerificationAsync(userId.Value, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("验证邮件已重新发送。"), StudioJson.Options));
    }

    [HttpPost("/api/studio/auth/forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("发送密码重置邮件；响应不区分邮箱是否存在。")]
    public async Task<IResult> ForgotPassword([FromBody] StudioForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var result = await auth.ForgotPasswordAsync(request.Email, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("如果该邮箱已注册，重置邮件已发送。"), StudioJson.Options));
    }

    [HttpPost("/api/studio/auth/reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("studio-auth")]
    [EndpointSummary("使用邮件令牌重置密码，并撤销全部会话。")]
    public async Task<IResult> ResetPassword([FromBody] StudioResetPasswordRequest request, CancellationToken cancellationToken)
    {
        var result = await auth.ResetPasswordAsync(request.Token, request.NewPassword, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("密码已重置，请重新登录。"), StudioJson.Options));
    }
}
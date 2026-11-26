using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.XiaomiCamera.Api;

[ApiController]
[EndpointModule("xiaomi-camera")]
[XiaomiEndpoint]
[EnableCors(ApiAuthorization.CorsPolicy)]
[Authorize(Policy = ApiAuthorization.ManagementPolicy)]
public sealed class XiaomiCameraSetupController : ControllerBase
{
    [HttpGet("/api/xiaomi-camera/setup/session")]
    [EnableRateLimiting("setup-ui")]
    [EndpointSummary("读取小米账号登录状态。")]
    public IResult Session([FromServices] XiaomiCredentialCache cache)
    {
        return Results.Ok(cache.TryLoad() is null ? XiaomiSetupResponse.LoginRequired() : XiaomiSetupResponse.Completed(usedCachedSession: true));
    }

    [HttpDelete("/api/xiaomi-camera/setup/session")]
    [EnableRateLimiting("xiaomi-bootstrap")]
    [EndpointSummary("清除已保存的小米账号登录。")]
    public IResult ClearSession([FromServices] XiaomiCredentialCache cache, [FromServices] XiaomiCameraDirectoryService directory)
    {
        cache.Clear();
        directory.Invalidate();
        return Results.NoContent();
    }

    [HttpPost("/api/xiaomi-camera/setup/login")]
    [EnableRateLimiting("xiaomi-bootstrap")]
    [EndpointSummary("使用小米账号密码登录，必要时转入验证码。")]
    public async Task<IResult> Login([FromBody] XiaomiSetupLoginRequest input, [FromServices] XiaomiAccountLoginFlow loginFlow, [FromServices] XiaomiCredentialCache cache, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Username) || string.IsNullOrWhiteSpace(input.Password))
            return Results.BadRequest(new XiaomiSetupError("invalid_input", "账号和密码不能为空。"));
        try
        {
            var attempt = await loginFlow.StartAsync(input.Username, input.Password, input.Region ?? "cn", cancellationToken);
            if (!attempt.IsAuthenticated)
                return Results.Json(XiaomiSetupResponse.NeedsVerification(attempt.AttemptId!.Value, attempt.VerificationKind!, attempt.VerificationDestination),
                    XiaomiHttpJsonContext.Default.XiaomiSetupResponse, statusCode: StatusCodes.Status202Accepted);

            cache.Save(attempt.Credentials!);
            return Results.Ok(XiaomiSetupResponse.Completed(usedCachedSession: false));
        }
        catch (XiaomiCloudException exception)
        {
            return Results.BadRequest(new XiaomiSetupError("xiaomi_login_failed", exception.Message));
        }
    }

    [HttpPost("/api/xiaomi-camera/setup/{attemptId:guid}/verify")]
    [EnableRateLimiting("xiaomi-bootstrap")]
    [EndpointSummary("提交短信或邮箱验证码完成登录。")]
    public async Task<IResult> Verify([FromRoute] Guid attemptId, [FromBody] XiaomiSetupVerificationRequest input, [FromServices] XiaomiAccountLoginFlow loginFlow, [FromServices] XiaomiCredentialCache cache, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Code))
            return Results.BadRequest(new XiaomiSetupError("invalid_input", "验证码不能为空。"));
        try
        {
            var attempt = await loginFlow.SubmitVerificationCodeAsync(attemptId, input.Code, cancellationToken);
            cache.Save(attempt.Credentials!);
            return Results.Ok(XiaomiSetupResponse.Completed(usedCachedSession: false));
        }
        catch (XiaomiCloudException exception)
        {
            return Results.BadRequest(new XiaomiSetupError("xiaomi_login_failed", exception.Message));
        }
    }
}
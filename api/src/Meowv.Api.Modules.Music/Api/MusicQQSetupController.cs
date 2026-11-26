using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Music.Api;

[ApiController]
[EndpointModule("music", OptionsType = typeof(MusicOptions), RuntimeType = typeof(MusicRuntime))]
[Authorize(Policy = ApiAuthorization.ManagementPolicy)]
[NoQueryManagementToken]
public sealed class MusicQQSetupController : ControllerBase
{
    [HttpGet("/api/music/setup/qq/session")]
    [ModuleReady]
    [EnableRateLimiting("music-qq-status")]
    [EndpointSummary("读取 QQ 音乐登录和授权设备状态。")]
    public IResult Session() => Results.Json(HttpContext.RequestServices.GetRequiredService<QQMembership>().Status(), QQJsonContext.Default.QQSessionStatus);

    [HttpPost("/api/music/setup/qq/login")]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("发起 QQ 音乐 App 扫码登录。")]
    public IResult Login() => Results.Json(HttpContext.RequestServices.GetRequiredService<QQMembership>().Start(), QQJsonContext.Default.QQLoginAttempt, statusCode: 202);

    [HttpGet("/api/music/setup/qq/login/{id:guid}/qr")]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("读取当次 QQ 音乐登录二维码。")]
    public IResult Qr([FromRoute] Guid id) => HttpContext.RequestServices.GetRequiredService<QQMembership>().Image(id) is { } image ? Results.File(image, "image/png") : Results.NotFound();

    [HttpDelete("/api/music/setup/qq/login/{id:guid}")]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("取消当次 QQ 音乐扫码。")]
    public IResult CancelLogin([FromRoute] Guid id)
    {
        HttpContext.RequestServices.GetRequiredService<QQMembership>().Cancel(id);
        return Results.NoContent();
    }

    [HttpDelete("/api/music/setup/qq/session")]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("注销后端保存的 QQ 音乐会话。")]
    public IResult Logout()
    {
        HttpContext.RequestServices.GetRequiredService<QQMembership>().Logout();
        return Results.NoContent();
    }

    [HttpPut("/api/music/setup/qq/devices/{id}")]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("设置指定设备的 QQ 音乐会员播放权限。")]
    public async Task<IResult> SetDevice([FromRoute] string id)
    {
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        var body = await MusicController.ReadBody(HttpContext, QQJsonContext.Default.QQDeviceGrant, maxBytes: 256);
        if (body.Enabled is not { } enabled) throw MusicException.Invalid();
        return member.SetDevice(id, enabled) ? Results.NoContent() : Results.NotFound();
    }
}
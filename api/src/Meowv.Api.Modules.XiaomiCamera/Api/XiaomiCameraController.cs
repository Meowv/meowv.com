using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.XiaomiCamera.Api;

[ApiController]
[EndpointModule("xiaomi-camera")]
[XiaomiEndpoint]
[EnableCors(ApiAuthorization.CorsPolicy)]
public sealed class XiaomiCameraController : ControllerBase
{
    [HttpGet("/api/xiaomi-camera/cameras")]
    [Authorize]
    [EnableRateLimiting("xiaomi-access-code")]
    [EndpointSummary("列出支持 CS2 播放的摄像头。")]
    public Task<IResult> Cameras([FromServices] XiaomiCredentialCache cache, [FromServices] XiaomiCameraDirectoryService directory, CancellationToken cancellationToken) => CamerasCore(cache, directory, cancellationToken);

    [HttpPost("/api/xiaomi-camera/playback-sessions")]
    [Authorize]
    [EnableRateLimiting("xiaomi-playback-session")]
    [EndpointSummary("为指定摄像头创建播放会话并返回 HLS 地址。")]
    public Task<IResult> CreatePlayback([FromServices] XiaomiCredentialCache cache, [FromServices] IAccessCodeService accessCodes, [FromServices] XiaomiCameraDirectoryService directory, [FromServices] XiaomiPlaybackTicketService tickets, [FromServices] XiaomiHlsService hls, [FromBody] XiaomiPlaybackSessionRequest input, CancellationToken cancellationToken) => CreatePlaybackCore(HttpContext, cache, accessCodes, directory, tickets, hls, input, cancellationToken);

    [HttpPost("/api/xiaomi-camera/cameras/{fingerprint}/ptz")]
    [Authorize]
    [EnableRateLimiting("xiaomi-motor")]
    [EndpointSummary("向指定摄像头发送云台方向指令。")]
    public Task<IResult> Ptz([FromRoute] string fingerprint, [FromBody] XiaomiMotorStepRequest input, [FromServices] XiaomiHlsService hls, CancellationToken cancellationToken) => PtzCore(fingerprint, input, hls, cancellationToken);

    [HttpGet("/api/xiaomi-camera/playback-sessions/{ticket}/status")]
    [AllowAnonymous]
    [EndpointAccess("播放票据")]
    [EndpointSummary("查询播放会话的准备状态。")]
    public IResult PlaybackStatus([FromRoute] string ticket, [FromServices] XiaomiPlaybackTicketService tickets, [FromServices] XiaomiHlsService hls) => PlaybackStatusCore(ticket, tickets, hls);

    [HttpGet("/api/xiaomi-camera/playback-sessions/{ticket}/index.m3u8")]
    [AllowAnonymous]
    [EndpointAccess("播放票据")]
    [EndpointSummary("读取 HLS 播放清单。")]
    public Task<IResult> Playlist([FromRoute] string ticket, [FromServices] XiaomiPlaybackTicketService tickets, [FromServices] XiaomiHlsService hls) => PlaylistCore(HttpContext, ticket, tickets, hls);

    [HttpGet("/api/xiaomi-camera/playback-sessions/{ticket}/{name}")]
    [AllowAnonymous]
    [EndpointAccess("播放票据")]
    [EndpointSummary("读取 HLS 媒体分片。")]
    public IResult Segment([FromRoute] string ticket, [FromRoute] string name, [FromServices] XiaomiPlaybackTicketService tickets, [FromServices] XiaomiHlsService hls) => SegmentCore(HttpContext, ticket, name, tickets, hls);

    private static async Task<IResult> CamerasCore(XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory, CancellationToken cancellationToken)
    {
        var credentials = cache.TryLoad(out var sessionVersion);
        if (credentials is null) return XiaomiSessionExpired();
        try
        {
            var cameras = await directory.GetAsync(credentials, cancellationToken);
            var result = new List<XiaomiPlaybackCamera>();
            foreach (var camera in cameras)
            {
                if (!camera.Probe.IsCs2Compatible) continue;
                result.Add(new XiaomiPlaybackCamera(
                    XiaomiCameraDirectoryService.DeviceFingerprint(camera.Camera.Id),
                    camera.Camera.Model, camera.Camera.DisplayName, camera.Camera.IsOnline));
            }

            return Results.Ok(result);
        }
        catch (XiaomiCloudSessionExpiredException)
        {
            if (cache.Clear(sessionVersion)) directory.Invalidate();
            return XiaomiSessionExpired();
        }
        catch (XiaomiCloudException)
        {
            return Results.Problem("无法读取摄像头目录。", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static async Task<IResult> CreatePlaybackCore(HttpContext context, XiaomiCredentialCache cache, IAccessCodeService accessCodes, XiaomiCameraDirectoryService directory, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls, XiaomiPlaybackSessionRequest input, CancellationToken cancellationToken)
    {
        var accessCodeVersion = ApiAuthorization.GetVersion(context.User);

        var credentials = cache.TryLoad(out var sessionVersion);
        if (credentials is null) return XiaomiSessionExpired();
        if (string.IsNullOrWhiteSpace(input.DeviceFingerprint))
            return Results.BadRequest(new XiaomiSetupError("invalid_camera", "必须提供摄像头标识。"));

        try
        {
            var camera = await directory.FindAsync(credentials, input.DeviceFingerprint, cancellationToken);
            if (camera is null || !camera.Camera.IsOnline)
                return Results.BadRequest(new XiaomiSetupError("camera_unavailable", "目标摄像机不存在或当前离线。"));
            if (!camera.Probe.IsCs2Compatible)
                return Results.BadRequest(new XiaomiSetupError("camera_unsupported", "目标摄像机不支持 CS2 视频播放。"));

            if (accessCodeVersion != accessCodes.GetVersion()) return AccessCodeUnauthorized();
            var target = hls.Start(input.DeviceFingerprint, sessionVersion);
            if (target is null) return XiaomiSessionExpired();
            if (accessCodeVersion != accessCodes.GetVersion())
            {
                hls.Stop(target.Value);
                return AccessCodeUnauthorized();
            }

            var ticket = tickets.Create(target.Value, accessCodeVersion);
            if (ticket is null)
            {
                hls.Stop(target.Value);
                return accessCodeVersion != accessCodes.GetVersion() ? AccessCodeUnauthorized() : XiaomiSessionExpired();
            }

            var sessionUrl = $"{context.Request.PathBase}{XiaomiCameraModule.ApiPrefix}/playback-sessions/{ticket}";
            var preparation = hls.GetPreparation(target.Value);
            return Results.Ok(new XiaomiPlaybackSessionResponse(
                $"{sessionUrl}/index.m3u8", preparation.Status, $"{sessionUrl}/status", preparation.AudioAvailable));
        }
        catch (XiaomiPlaybackCapacityException)
        {
            return Results.Json(new XiaomiSetupError("camera_capacity_exceeded", "播放设备数量已达上限，请稍后重试。"),
                XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status429TooManyRequests);
        }
        catch (XiaomiCloudSessionExpiredException)
        {
            if (cache.Clear(sessionVersion)) directory.Invalidate();
            return XiaomiSessionExpired();
        }
        catch (XiaomiCloudException)
        {
            return Results.Problem("无法创建摄像头播放会话。", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static async Task<IResult> PtzCore(string fingerprint, XiaomiMotorStepRequest input, XiaomiHlsService hls, CancellationToken cancellationToken)
    {
        var operation = input.Direction?.ToLowerInvariant() switch
        {
            "left" => 1, "right" => 2, "up" => 3, "down" => 4, _ => 0,
        };
        if (operation == 0)
            return Results.BadRequest(new XiaomiSetupError("invalid_direction", "方向仅支持 left、right、up、down。"));

        try
        {
            return await hls.MotorStepAsync(fingerprint, operation, cancellationToken) switch
            {
                XiaomiMotorStepResult.Sent => Results.Ok(new XiaomiMotorStepResponse("sent")),
                XiaomiMotorStepResult.NoSession => Results.Conflict(new XiaomiSetupError("camera_session_unavailable", "请先启动该摄像头的预览。")),
                XiaomiMotorStepResult.TooFrequent => Results.StatusCode(StatusCodes.Status429TooManyRequests),
                XiaomiMotorStepResult.UnsupportedModel => Results.BadRequest(new XiaomiSetupError("ptz_model_unverified", "该型号尚未验证云台指令。")),
                _ => Results.StatusCode(StatusCodes.Status503ServiceUnavailable),
            };
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return Results.Problem("云台指令发送失败。", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static IResult PlaybackStatusCore(string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls)
    {
        if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target)) return Results.NotFound();
        return Results.Ok(hls.GetPreparation(target));
    }

    private static async Task<IResult> PlaylistCore(HttpContext context, string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls)
    {
        if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
            return Results.StatusCode(StatusCodes.Status410Gone);
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        context.Response.Headers.Pragma = "no-cache";
        try
        {
            var playlist = await hls.WaitForPlaylistAsync(target, context.RequestAborted);
            return Results.File(playlist, "application/vnd.apple.mpegurl", enableRangeProcessing: false);
        }
        catch (XiaomiPlaybackException exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            context.Response.StatusCode = exception.Retryable ? StatusCodes.Status503ServiceUnavailable : StatusCodes.Status400BadRequest;
            return Results.Json(new XiaomiSetupError("xiaomi_playback_failed", exception.Message), XiaomiHttpJsonContext.Default.XiaomiSetupError);
        }
    }

    private static IResult SegmentCore(HttpContext context, string ticket, string name, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls)
    {
        if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
            return Results.StatusCode(StatusCodes.Status410Gone);
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        var segment = hls.SegmentPath(target, name);
        return segment is null ? Results.NotFound() : Results.File(segment, "video/mp2t", enableRangeProcessing: false);
    }

    private static IResult AccessCodeUnauthorized() => Results.Json(new XiaomiSetupError("access_code_unauthorized", "授权码无效。"), XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status401Unauthorized);

    private static IResult XiaomiSessionExpired() => Results.Json(new XiaomiSetupError("xiaomi_session_expired", "小米登录会话已失效，请使用 API 管理密钥重新初始化。"), XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status409Conflict);
}
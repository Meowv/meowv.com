using Meowv.Api.Core;
using Meowv.Api.Modules.XiaomiCamera.Cloud;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>小米摄像头模块。端点入口不持有业务服务，业务依赖在请求中解析。</summary>
public sealed class XiaomiCameraModule : IEndpointModule
{
    public const string ApiPrefix = "/api/xiaomi-camera";
    internal const string CorsPolicy = ApiAuthorization.CorsPolicy;
    public string Name => "xiaomi-camera";
    public string Description => "小米摄像头登录、设备目录与实时播放。";

    public void ConfigureMiddleware(IApplicationBuilder application) =>
        application.UseMiddleware<XiaomiModuleAvailabilityMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(ApiPrefix + "/health", (XiaomiModuleRuntime runtime) =>
                Results.Json(new XiaomiModuleHealthResponse(runtime.Status, runtime.FailureReason), XiaomiHttpJsonContext.Default.XiaomiModuleHealthResponse,
                    statusCode: runtime.IsReady ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable))
            .RequireCors(CorsPolicy);
        MapSetup(endpoints.MapGroup(ApiPrefix + "/setup")
            .WithMetadata(new XiaomiEndpointMetadata()).RequireCors(CorsPolicy)
            .RequireAuthorization(ApiAuthorization.ManagementPolicy));
        MapApi(endpoints.MapGroup(ApiPrefix), legacy: false);
        MapApi(endpoints.MapGroup("/api"), legacy: true);
    }

    private static void MapSetup(RouteGroupBuilder setup)
    {
        setup.MapGet("/session", (XiaomiCredentialCache cache) =>
        {
            if (cache.TryLoad() is null)
            {
                return Results.Ok(XiaomiSetupResponse.LoginRequired());
            }

            return Results.Ok(XiaomiSetupResponse.Completed(usedCachedSession: true));
        }).RequireRateLimiting("xiaomi-bootstrap");

        setup.MapDelete("/session", (XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory) =>
        {
            cache.Clear();
            directory.Invalidate();
            return Results.NoContent();
        }).RequireRateLimiting("xiaomi-bootstrap");

        setup.MapPost("/login", async (XiaomiSetupLoginRequest input, XiaomiAccountLoginFlow loginFlow, XiaomiCredentialCache cache, CancellationToken cancellationToken) =>
        {
            try
            {
                var attempt = await loginFlow.StartAsync(input.Username, input.Password, input.Region ?? "cn", cancellationToken);
                if (!attempt.IsAuthenticated)
                {
                    return Results.Json(XiaomiSetupResponse.NeedsVerification(
                        attempt.AttemptId!.Value,
                        attempt.VerificationKind!,
                        attempt.VerificationDestination), XiaomiHttpJsonContext.Default.XiaomiSetupResponse,
                        statusCode: StatusCodes.Status202Accepted);
                }

                cache.Save(attempt.Credentials!);
                return Results.Ok(XiaomiSetupResponse.Completed(usedCachedSession: false));
            }
            catch (XiaomiCloudException exception)
            {
                return Results.BadRequest(new XiaomiSetupError("xiaomi_login_failed", exception.Message));
            }
        }).RequireRateLimiting("xiaomi-bootstrap");

        setup.MapPost("/{attemptId:guid}/verify", async (Guid attemptId, XiaomiSetupVerificationRequest input, XiaomiAccountLoginFlow loginFlow, XiaomiCredentialCache cache, CancellationToken cancellationToken) =>
        {
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
        }).RequireRateLimiting("xiaomi-bootstrap");
    }

    private static void MapApi(RouteGroupBuilder app, bool legacy)
    {
        app.WithMetadata(new XiaomiEndpointMetadata()).RequireCors(CorsPolicy);
        app.MapGet("/cameras", async (HttpContext _, XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory, CancellationToken cancellationToken) =>
        {
            var credentials = cache.TryLoad(out var sessionVersion);
            if (credentials is null)
            {
                return XiaomiSessionExpired();
            }

            try
            {
                var cameras = await directory.GetAsync(credentials, cancellationToken);
                var result = new List<XiaomiPlaybackCamera>();
                foreach (var camera in cameras)
                {
                    if (!camera.Probe.IsCs2Compatible)
                    {
                        continue;
                    }

                    result.Add(new XiaomiPlaybackCamera(
                        XiaomiCameraDirectoryService.DeviceFingerprint(camera.Camera.Id),
                        camera.Camera.Model,
                        camera.Camera.DisplayName,
                        camera.Camera.IsOnline));
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
        }).RequireAuthorization().RequireRateLimiting("xiaomi-access-code");

        app.MapPost("/playback-sessions", async (HttpContext context, XiaomiCredentialCache cache, IAccessCodeService accessCodes, XiaomiCameraDirectoryService directory, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls, XiaomiPlaybackSessionRequest input, CancellationToken cancellationToken) =>
        {
            var accessCodeVersion = ApiAuthorization.GetVersion(context.User);

            var credentials = cache.TryLoad(out var sessionVersion);
            if (credentials is null)
            {
                return XiaomiSessionExpired();
            }

            if (string.IsNullOrWhiteSpace(input.DeviceFingerprint))
            {
                return Results.BadRequest(new XiaomiSetupError("invalid_camera", "必须提供摄像头标识。"));
            }

            try
            {
                var camera = await directory.FindAsync(credentials, input.DeviceFingerprint, cancellationToken);
                if (camera is null || !camera.Camera.IsOnline)
                {
                    return Results.BadRequest(new XiaomiSetupError("camera_unavailable", "目标摄像机不存在或当前离线。"));
                }

                if (!camera.Probe.IsCs2Compatible)
                {
                    return Results.BadRequest(new XiaomiSetupError("camera_unsupported", "目标摄像机不支持 CS2 视频播放。"));
                }

                if (accessCodeVersion != accessCodes.GetVersion()) return AccessCodeUnauthorized();
                var target = hls.Start(input.DeviceFingerprint, sessionVersion);
                if (target is null) return XiaomiSessionExpired();
                var ticket = tickets.Create(target.Value, accessCodeVersion);
                if (ticket is null)
                {
                    return accessCodeVersion != accessCodes.GetVersion() ? AccessCodeUnauthorized() : XiaomiSessionExpired();
                }

                var sessionUrl = $"{context.Request.PathBase}{(legacy ? "/api" : ApiPrefix)}/playback-sessions/{ticket}";
                var preparation = hls.GetPreparation(target.Value);
                return Results.Ok(new XiaomiPlaybackSessionResponse(
                    $"{sessionUrl}/index.m3u8",
                    preparation.Status,
                    $"{sessionUrl}/status",
                    preparation.AudioAvailable));
            }
            catch (XiaomiPlaybackCapacityException)
            {
                return Results.Json(new XiaomiSetupError("camera_capacity_exceeded", "播放设备数量已达上限，请稍后重试。"), XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status429TooManyRequests);
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
        }).RequireAuthorization().RequireRateLimiting("xiaomi-playback-session");

        app.MapPost("/cameras/{fingerprint}/ptz", async (HttpContext _, string fingerprint, XiaomiMotorStepRequest input, XiaomiHlsService hls, CancellationToken cancellationToken) =>
        {
            var operation = input.Direction?.ToLowerInvariant() switch
            {
                "left" => 1,
                "right" => 2,
                "up" => 3,
                "down" => 4,
                _ => 0,
            };
            if (operation == 0)
            {
                return Results.BadRequest(new XiaomiSetupError("invalid_direction", "方向仅支持 left、right、up、down。"));
            }

            try
            {
                var result = await hls.MotorStepAsync(fingerprint, operation, cancellationToken) switch
                {
                    XiaomiMotorStepResult.Sent => Results.Ok(new XiaomiMotorStepResponse("sent")),
                    XiaomiMotorStepResult.NoSession => Results.Conflict(new XiaomiSetupError("camera_session_unavailable", "请先启动该摄像头的预览。")),
                    XiaomiMotorStepResult.TooFrequent => Results.StatusCode(StatusCodes.Status429TooManyRequests),
                    XiaomiMotorStepResult.UnsupportedModel => Results.BadRequest(new XiaomiSetupError("ptz_model_unverified", "该型号尚未验证云台指令。")),
                    _ => Results.StatusCode(StatusCodes.Status503ServiceUnavailable),
                };
                return result;
            }
            catch (Exception) when (!cancellationToken.IsCancellationRequested)
            {
                return Results.Problem("云台指令发送失败。", statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).RequireAuthorization().RequireRateLimiting("xiaomi-motor");

        app.MapGet("/playback-sessions/{ticket}/status", (string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
        {
            // 状态轮询使用短期播放票据，不需要发送长期应用授权码。
            if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
            {
                return Results.NotFound();
            }

            return Results.Ok(hls.GetPreparation(target));
        }).WithMetadata(new EndpointAccessMetadata("播放票据"));

        app.MapGet("/playback-sessions/{ticket}/index.m3u8", async (HttpContext context, string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
        {
            // HLS 客户端无法可靠地附加 Bearer 头；此处只接受绑定设备的短期票据。
            if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
            {
                // 分片不存在同样会返回 404；用 410 让浏览器端能准确区分票据失效。
                return Results.StatusCode(StatusCodes.Status410Gone);
            }

            context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
            context.Response.Headers.Pragma = "no-cache";
            try
            {
                var playlist = await hls.WaitForPlaylistAsync(target, context.RequestAborted);
                return Results.File(playlist, "application/vnd.apple.mpegurl", enableRangeProcessing: false);
            }
            catch (XiaomiPlaybackException exception) when (!context.RequestAborted.IsCancellationRequested)
            {
                context.Response.StatusCode = exception.Retryable
                    ? StatusCodes.Status503ServiceUnavailable
                    : StatusCodes.Status400BadRequest;
                return Results.Json(new XiaomiSetupError("xiaomi_playback_failed", exception.Message), XiaomiHttpJsonContext.Default.XiaomiSetupError);
            }
        }).WithMetadata(new EndpointAccessMetadata("播放票据"));

        app.MapGet("/playback-sessions/{ticket}/{name}", (HttpContext context, string ticket, string name, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
        {
            // 分片沿用清单路径中的票据，长期授权码绝不进入媒体 URL。
            if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
            {
                return Results.StatusCode(StatusCodes.Status410Gone);
            }

            context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
            var segment = hls.SegmentPath(target, name);
            return segment is null ? Results.NotFound() : Results.File(segment, "video/mp2t", enableRangeProcessing: false);
        }).WithMetadata(new EndpointAccessMetadata("播放票据"));
    }

    static IResult AccessCodeUnauthorized() => Results.Json(new XiaomiSetupError("access_code_unauthorized", "授权码无效。"), XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status401Unauthorized);

    static IResult XiaomiSessionExpired() => Results.Json(new XiaomiSetupError("xiaomi_session_expired", "小米登录会话已失效，请使用 API 管理密钥重新初始化。"), XiaomiHttpJsonContext.Default.XiaomiSetupError, statusCode: StatusCodes.Status409Conflict);
}

public sealed record XiaomiModuleHealthResponse(string Status, string? Message);

public sealed record XiaomiSetupLoginRequest(string Username, string Password, string? Region);

public sealed record XiaomiSetupVerificationRequest(string Code);

public sealed record XiaomiSetupError(string Code, string Message);

public sealed record XiaomiPlaybackCamera(string DeviceFingerprint, string Model, string DisplayName, bool IsOnline);

public sealed record XiaomiPlaybackSessionRequest(string DeviceFingerprint);

public sealed record XiaomiMotorStepRequest(string? Direction);

public sealed record XiaomiMotorStepResponse(string Status);

public sealed record XiaomiPlaybackSessionResponse(string PlaylistUrl, string Status, string StatusUrl, bool AudioAvailable);

public sealed record XiaomiSetupResponse(string Status, Guid? AttemptId, string? VerificationKind, string? VerificationDestination, bool? UsedCachedSession)
{
    public static XiaomiSetupResponse NeedsVerification(Guid attemptId, string kind, string? destination) =>
        new("verification_required", attemptId, kind, destination, null);

    public static XiaomiSetupResponse Completed(bool usedCachedSession) =>
        new("completed", null, null, null, usedCachedSession);

    public static XiaomiSetupResponse LoginRequired() =>
        new("login_required", null, null, null, false);
}

using System.Threading.RateLimiting;
using XiaomiCamera;
using XiaomiCamera.Cloud;

var builder = WebApplication.CreateBuilder(args);
var cameraOptions = XiaomiCameraOptions.Load();

builder.Services.AddSingleton(cameraOptions);
builder.Services.AddSingleton<XiaomiBootstrapAuthorization>();
builder.Services.AddSingleton<XiaomiAccessCodeAuthorization>();
builder.Services.AddSingleton<XiaomiAccountLoginFlow>();
builder.Services.AddSingleton<XiaomiCredentialCache>();
builder.Services.AddSingleton<XiaomiCameraDirectoryService>();
builder.Services.AddSingleton<XiaomiPlaybackTicketService>();
builder.Services.AddSingleton<XiaomiLiveStreamService>();
builder.Services.AddSingleton<XiaomiFfmpegResolver>();
builder.Services.AddSingleton<XiaomiHlsService>();
builder.Services.AddHttpClient("xiaomi-cloud", client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddCors(options => options.AddPolicy("studio", policy => policy.WithOrigins([.. cameraOptions.AllowedOrigins]).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("bootstrap", context => CreateFailedRequestLimiter(context, permitLimit: 10));
    options.AddPolicy("access-code", context => CreateFailedRequestLimiter(context, permitLimit: 30));
    options.AddPolicy("playback-session", context => CreateFailedRequestLimiter(context, permitLimit: 20));
    options.AddPolicy("motor", context => CreateFailedRequestLimiter(context, permitLimit: 20));
});

var app = builder.Build();
if (cameraOptions.WasCreated)
{
    // 仅记录路径，不记录自动生成的密钥或部署令牌。
    app.Logger.LogInformation("已创建 XiaomiCamera 配置文件：{ConfigPath}", cameraOptions.ConfigPath);
}

// 提前打开数据库，避免首个 API 请求承担建表与连接初始化延迟。
_ = app.Services.GetRequiredService<XiaomiCredentialCache>();
var ffmpeg = app.Services.GetRequiredService<XiaomiFfmpegResolver>();
app.Logger.LogInformation("FFmpeg 启动预检通过，来源：{Source}", ffmpeg.Source);
app.Logger.LogInformation(
    "媒体档位配置：{Profile}，最大画幅 {MaximumWidth}x{MaximumHeight}，帧率目标上限 {MaximumFps} fps，目标/峰值码率 {TargetBitrate}/{PeakBitrate} kbps，编码预设 {Preset}",
    cameraOptions.MediaProfile.Name,
    cameraOptions.MediaProfile.MaximumWidth,
    cameraOptions.MediaProfile.MaximumHeight,
    cameraOptions.MediaProfile.MaximumFramesPerSecond,
    cameraOptions.MediaProfile.TargetBitrateKbps,
    cameraOptions.MediaProfile.PeakBitrateKbps,
    cameraOptions.MediaProfile.EncoderPreset);
app.UseCors("studio");
app.UseRateLimiter();

app.MapGet("/api/health", () => Results.Ok(new GatewayHealthResponse("healthy")));

app.MapGet("/setup/xiaomi", () => Results.Content(XiaomiSetupPage.Html, "text/html; charset=utf-8"));

app.MapGet("/api/setup/xiaomi/session", (HttpContext context, XiaomiBootstrapAuthorization bootstrap, XiaomiCredentialCache cache) =>
{
    if (!bootstrap.IsAuthorized(context.Request))
    {
        return BootstrapUnauthorized();
    }

    if (cache.TryLoad() is null)
    {
        return Results.Ok(XiaomiSetupResponse.LoginRequired());
    }

    return Results.Ok(XiaomiSetupResponse.Completed(usedCachedSession: true, accessCode: cache.CreateAccessCodeIfMissing()));
}).RequireRateLimiting("bootstrap");

app.MapDelete("/api/setup/xiaomi/session", (HttpContext context, XiaomiBootstrapAuthorization bootstrap, XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory) =>
{
    if (!bootstrap.IsAuthorized(context.Request))
    {
        return BootstrapUnauthorized();
    }

    cache.Clear();
    directory.Invalidate();
    return Results.NoContent();
}).RequireRateLimiting("bootstrap");

app.MapPost("/api/setup/xiaomi/access-code/rotate", (HttpContext context, XiaomiBootstrapAuthorization bootstrap, XiaomiCredentialCache cache) =>
{
    if (!bootstrap.IsAuthorized(context.Request))
    {
        return BootstrapUnauthorized();
    }

    return Results.Ok(new XiaomiAccessCodeResponse(cache.RotateAccessCode()));
}).RequireRateLimiting("bootstrap");

app.MapPost("/api/setup/xiaomi/login", async (HttpContext context, XiaomiBootstrapAuthorization bootstrap, XiaomiSetupLoginRequest input, XiaomiAccountLoginFlow loginFlow, XiaomiCredentialCache cache, CancellationToken cancellationToken) =>
{
    if (!bootstrap.IsAuthorized(context.Request))
    {
        return BootstrapUnauthorized();
    }

    try
    {
        var attempt = await loginFlow.StartAsync(input.Username, input.Password, input.Region ?? "cn", cancellationToken);
        if (!attempt.IsAuthenticated)
        {
            return Results.Accepted($"/setup/xiaomi/{attempt.AttemptId}", XiaomiSetupResponse.NeedsVerification(
                attempt.AttemptId!.Value,
                attempt.VerificationKind!,
                attempt.VerificationDestination));
        }

        cache.Save(attempt.Credentials!);
        return Results.Ok(XiaomiSetupResponse.Completed(
            usedCachedSession: false,
            accessCode: cache.CreateAccessCodeIfMissing()));
    }
    catch (XiaomiCloudException exception)
    {
        return Results.BadRequest(new XiaomiSetupError("xiaomi_login_failed", exception.Message));
    }
}).RequireRateLimiting("bootstrap");

app.MapPost("/api/setup/xiaomi/{attemptId:guid}/verify", async (HttpContext context, XiaomiBootstrapAuthorization bootstrap, Guid attemptId, XiaomiSetupVerificationRequest input, XiaomiAccountLoginFlow loginFlow, XiaomiCredentialCache cache, CancellationToken cancellationToken) =>
{
    if (!bootstrap.IsAuthorized(context.Request))
    {
        return BootstrapUnauthorized();
    }

    try
    {
        var attempt = await loginFlow.SubmitVerificationCodeAsync(attemptId, input.Code, cancellationToken);
        cache.Save(attempt.Credentials!);
        return Results.Ok(XiaomiSetupResponse.Completed(
            usedCachedSession: false,
            accessCode: cache.CreateAccessCodeIfMissing()));
    }
    catch (XiaomiCloudException exception)
    {
        return Results.BadRequest(new XiaomiSetupError("xiaomi_login_failed", exception.Message));
    }
}).RequireRateLimiting("bootstrap");

app.MapGet("/api/cameras", async (HttpContext context, XiaomiAccessCodeAuthorization accessCodeAuthorization, XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory, CancellationToken cancellationToken) =>
{
    if (!accessCodeAuthorization.IsAuthorized(context.Request))
    {
        return AccessCodeUnauthorized();
    }

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
}).RequireRateLimiting("access-code");

app.MapPost("/api/playback-sessions", async (HttpContext context, XiaomiAccessCodeAuthorization accessCodeAuthorization, XiaomiCredentialCache cache, XiaomiCameraDirectoryService directory, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls, XiaomiPlaybackSessionRequest input, CancellationToken cancellationToken) =>
{
    if (!accessCodeAuthorization.IsAuthorized(context.Request, out var accessCodeVersion))
    {
        return AccessCodeUnauthorized();
    }

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

        if (accessCodeVersion != cache.GetAccessCodeVersion()) return AccessCodeUnauthorized();
        var target = hls.Start(input.DeviceFingerprint, sessionVersion);
        if (target is null) return XiaomiSessionExpired();
        var ticket = tickets.Create(target.Value, accessCodeVersion);
        if (ticket is null)
        {
            return accessCodeVersion != cache.GetAccessCodeVersion() ? AccessCodeUnauthorized() : XiaomiSessionExpired();
        }

        var sessionUrl = $"/api/playback-sessions/{ticket}";
        var preparation = hls.GetPreparation(target.Value);
        return Results.Ok(new XiaomiPlaybackSessionResponse(
            $"{sessionUrl}/index.m3u8",
            preparation.Status,
            $"{sessionUrl}/status",
            preparation.AudioAvailable));
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
}).RequireRateLimiting("playback-session");

app.MapPost("/api/cameras/{fingerprint}/ptz", async (HttpContext context, string fingerprint, XiaomiMotorStepRequest input, XiaomiAccessCodeAuthorization authorization, XiaomiHlsService hls, CancellationToken cancellationToken) =>
{
    if (!authorization.IsAuthorized(context.Request))
    {
        return AccessCodeUnauthorized();
    }

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
        IResult result = (await hls.MotorStepAsync(fingerprint, operation, cancellationToken)) switch
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
}).RequireRateLimiting("motor");

app.MapGet("/api/playback-sessions/{ticket}/status", (string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
{
    // 状态轮询使用短期播放票据，不需要发送长期应用授权码。
    if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
    {
        return Results.NotFound();
    }

    return Results.Ok(hls.GetPreparation(target));
});

app.MapGet("/api/playback-sessions/{ticket}/index.m3u8", async (HttpContext context, string ticket, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
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
        return Results.Json(new XiaomiSetupError("xiaomi_playback_failed", exception.Message));
    }
});

app.MapGet("/api/playback-sessions/{ticket}/{name}", (HttpContext context, string ticket, string name, XiaomiPlaybackTicketService tickets, XiaomiHlsService hls) =>
{
    // 分片沿用清单路径中的票据，长期授权码绝不进入媒体 URL。
    if (!tickets.TryGetPlayback(ticket, out var target) || !hls.IsCurrent(target))
    {
        return Results.StatusCode(StatusCodes.Status410Gone);
    }

    context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    var segment = hls.SegmentPath(target, name);
    return segment is null ? Results.NotFound() : Results.File(segment, "video/mp2t", enableRangeProcessing: false);
});

app.Run();
return;

static IResult BootstrapUnauthorized() => Results.Json(new XiaomiSetupError("bootstrap_unauthorized", "部署密钥无效。"), statusCode: StatusCodes.Status401Unauthorized);

static IResult AccessCodeUnauthorized() => Results.Json(new XiaomiSetupError("access_code_unauthorized", "授权码无效。"), statusCode: StatusCodes.Status401Unauthorized);

static IResult XiaomiSessionExpired() => Results.Json(new XiaomiSetupError("xiaomi_session_expired", "小米登录会话已失效，请使用部署密钥重新初始化。"), statusCode: StatusCodes.Status409Conflict);

static RateLimitPartition<string> CreateFailedRequestLimiter(HttpContext context, int permitLimit) => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
{
    PermitLimit = permitLimit,
    Window = TimeSpan.FromMinutes(1),
    QueueLimit = 0,
    AutoReplenishment = true,
});

public sealed record GatewayHealthResponse(string Status);

public sealed record XiaomiSetupLoginRequest(string Username, string Password, string? Region);

public sealed record XiaomiSetupVerificationRequest(string Code);

public sealed record XiaomiSetupError(string Code, string Message);

public sealed record XiaomiAccessCodeResponse(string AccessCode);

public sealed record XiaomiPlaybackCamera(string DeviceFingerprint, string Model, string DisplayName, bool IsOnline);

public sealed record XiaomiPlaybackSessionRequest(string DeviceFingerprint);

public sealed record XiaomiMotorStepRequest(string? Direction);

public sealed record XiaomiMotorStepResponse(string Status);

public sealed record XiaomiPlaybackSessionResponse(string PlaylistUrl, string Status, string StatusUrl, bool AudioAvailable);

public sealed record XiaomiSetupResponse(string Status, Guid? AttemptId, string? VerificationKind, string? VerificationDestination, bool? UsedCachedSession, string? AccessCode)
{
    public static XiaomiSetupResponse NeedsVerification(Guid attemptId, string kind, string? destination) =>
        new("verification_required", attemptId, kind, destination, null, null);

    public static XiaomiSetupResponse Completed(bool usedCachedSession, string? accessCode = null) =>
        new("completed", null, null, null, usedCachedSession, accessCode);

    public static XiaomiSetupResponse LoginRequired() =>
        new("login_required", null, null, null, false, null);
}
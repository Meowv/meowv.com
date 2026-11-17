using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Threading.RateLimiting;
using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Contracts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Music;

public sealed class MusicException(string code, string message, int status = 400, int? retryAfterSeconds = null) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
    public int? RetryAfterSeconds { get; } = retryAfterSeconds;
    public static MusicException Invalid() => new("invalid_request", "音乐请求参数无效。");
}

internal sealed record MusicProtectedEndpoint;

internal static class MusicErrors
{
    internal static Task Write(HttpContext context, int status, string code, string message, int? retryAfter = null)
    {
        context.Response.StatusCode = status;
        context.Response.Headers.CacheControl = "no-store";
        if (retryAfter is not null) context.Response.Headers.RetryAfter = retryAfter.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return context.Response.WriteAsJsonAsync(new MusicErrorResponse(new MusicError(code, message,
                code is "rate_limited" or "source_timeout" or "source_unavailable", retryAfter, context.TraceIdentifier)),
            MusicJsonContext.Default.MusicErrorResponse, cancellationToken: context.RequestAborted);
    }
}

public sealed class MusicAccessHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    MusicOptions music,
    MusicRuntime runtime,
    MusicDeviceStore devices) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "MusicDevice";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization;
        if (!runtime.Available || header.Count != 1) return Task.FromResult(AuthenticateResult.NoResult());
        var value = header.ToString();
        if (!value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) || value.Length is < 39 or > 1031)
            return Task.FromResult(AuthenticateResult.NoResult());
        var raw = value[7..];
        string? deviceId;
        try
        {
            deviceId = music.DeviceCredentialsEnabled ? devices.Verify(raw) : null;
        }
        catch (Exception error) when (error is Microsoft.Data.Sqlite.SqliteException or Infrastructure.ApiDatabaseSchemaException)
        {
            Context.Items["MusicCredentialStoreUnavailable"] = true;
            return Task.FromResult(AuthenticateResult.Fail("音乐凭据存储暂不可用。"));
        }

        var provided = SHA256.HashData(Encoding.UTF8.GetBytes(value[7..]));
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(music.TestAccessToken));
        if (deviceId is null && (music.TestAccessToken.Length < 32 || !CryptographicOperations.FixedTimeEquals(provided, expected))) return Task.FromResult(AuthenticateResult.Fail("音乐访问凭据无效。"));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, deviceId ?? "music-test-device")], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        if (Context.Items.ContainsKey("MusicCredentialStoreUnavailable"))
            return MusicErrors.Write(Context, 503, "source_unavailable", "音乐凭据存储暂不可用。");
        Response.Headers.WWWAuthenticate = "Bearer";
        return MusicErrors.Write(Context, 401, "unauthorized", "请配置有效的音乐专用访问凭据。");
    }
}

internal sealed class MusicRatePolicy(MusicOptions options) : IRateLimiterPolicy<string>
{
    public Func<OnRejectedContext, CancellationToken, ValueTask> OnRejected => async (rejected, _) =>
    {
        var seconds = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds)) : 60;
        await MusicErrors.Write(rejected.HttpContext, 429, "rate_limited", "音乐请求过于频繁。", seconds);
    };

    public RateLimitPartition<string> GetPartition(HttpContext context) => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Clamp(options.RequestsPerMinute, 1, 1000), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
        });
}

public sealed class MusicMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, MusicRuntime runtime, ILogger<MusicMiddleware> logger)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<EndpointModuleMetadata>()?.Name != "music")
        {
            await next(context);
            return;
        }

        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        IDisposable? lease = null;
        if (context.GetEndpoint()?.Metadata.GetMetadata<MusicProtectedEndpoint>() is not null)
        {
            if (!runtime.Available)
            {
                await MusicErrors.Write(context, 503, "source_unavailable", "音乐服务尚未就绪。");
                return;
            }

            if (!(await context.AuthenticateAsync(MusicAccessHandler.SchemeName)).Succeeded)
            {
                await context.ChallengeAsync(MusicAccessHandler.SchemeName);
                return;
            }

            if (!runtime.TryEnter(out lease, out var wait))
            {
                await MusicErrors.Write(context, 429, "rate_limited", "音乐请求过于频繁。", wait);
                return;
            }
        }

        using (lease)
        {
            try
            {
                if (context.Request.ContentLength > 4096) throw MusicException.Invalid();
                await next(context);
            }
            catch (MusicException error) when (!context.Response.HasStarted)
            {
                await MusicErrors.Write(context, error.Status, error.Code, error.Message, error.RetryAfterSeconds);
            }
            catch (Exception error) when (error is BadHttpRequestException or System.Text.Json.JsonException && !context.Response.HasStarted)
            {
                await MusicErrors.Write(context, 400, "invalid_request", "音乐请求格式无效。");
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
            }
            catch (Exception error) when (error is Microsoft.Data.Sqlite.SqliteException or Infrastructure.ApiDatabaseSchemaException && !context.Response.HasStarted)
            {
                await MusicErrors.Write(context, 503, "source_unavailable", "音乐凭据存储暂不可用。");
            }
            catch (Exception) when (!context.Response.HasStarted)
            {
                logger.LogWarning("Music 请求失败，requestId={RequestId}。", context.TraceIdentifier);
                await MusicErrors.Write(context, 500, "internal_error", "音乐服务暂时不可用。");
            }
        }
    }
}
using Meowv.Api.Core;
using Microsoft.AspNetCore.Authentication;

namespace Meowv.Api.Modules.Music;

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
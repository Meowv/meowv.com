using Meowv.Api.Infrastructure;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ChatRuntime runtime, ChatOptions options, IOptions<ApiCorsOptions> cors, ILogger<ChatMiddleware> logger)
    {
        if (!context.Request.Path.StartsWithSegments("/api/chat"))
        {
            await next(context);
            return;
        }

        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        if (context.Request.Path == "/api/chat/health")
        {
            await next(context);
            return;
        }

        if (!runtime.Ready)
        {
            await Error(context, 503, new ChatError("chat_unavailable", options.Enabled ? "聊天室暂不可用，请稍后重试。" : "聊天室暂未开放。"));
            return;
        }

        var hub = context.Request.Path.StartsWithSegments("/api/chat/hub");
        var write = !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method);
        if (hub || write)
        {
            var origin = context.Request.Headers.Origin.ToString();
            if (!cors.Value.AllowedOrigins.Contains(origin, StringComparer.Ordinal) || (!hub && context.Request.Headers["X-Chat-Request"] != "1"))
            {
                await Error(context, 403, new ChatError("untrusted_origin", "请求来源不受信任。"));
                return;
            }
        }

        // 在认证和 JSON 请求体绑定前限制体积。
        var bodySize = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
        if (bodySize is { IsReadOnly: false }) bodySize.MaxRequestBodySize = 8192;
        try
        {
            await next(context);
        }
        catch (ChatException error) when (!context.Response.HasStarted)
        {
            await Error(context, error.Status, new ChatError(error.Code, error.Message));
        }
        catch (Microsoft.Data.Sqlite.SqliteException) when (!context.Response.HasStarted)
        {
            logger.LogWarning("Chat 数据库操作失败。");
            await Error(context, 503, new ChatError("chat_unavailable", "聊天室暂不可用，请稍后重试。"));
        }
    }

    private static Task Error(HttpContext context, int status, ChatError error)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(error, ChatJsonContext.Default.ChatError);
    }
}
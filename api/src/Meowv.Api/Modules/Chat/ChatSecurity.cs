using System.Security.Claims;
using System.Text.Encodings.Web;
using Meowv.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatGuestAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ChatSessionService sessions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ChatGuest";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var session = sessions.Current(Context);
        if (session is not { Active: true }) return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, session.Guest.Id), new Claim("chat_hash", session.TokenHash)], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties { ExpiresUtc = session.ExpiresAt }, SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 401;
        return Response.WriteAsJsonAsync(new ChatError("session_expired", "请重新加入聊天室。"), ChatJsonContext.Default.ChatError);
    }
}

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
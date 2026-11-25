using System.Globalization;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Chat;

[ApiController]
[EndpointModule("chat", OptionsType = typeof(ChatOptions))]
public sealed class ChatController : ControllerBase
{
    [HttpGet("/api/chat/health")]
    [AllowAnonymous]
    [ModuleHealth]
    [EndpointSummary("聊天室模块就绪状态。")]
    public IResult Health([FromServices] ChatRuntime runtime)
        => Results.Json(new ChatHealth(runtime.Ready ? "ready" : "unavailable"), ChatJsonContext.Default.ChatHealth,
            statusCode: runtime.Ready ? 200 : 503);

    [HttpPost("/api/chat/session")]
    [AllowAnonymous]
    [EnableRateLimiting("chat-session")]
    [EndpointSummary("创建匿名会话；已有会话时复用，昵称变化时改名。")]
    public IResult CreateSession([FromBody] ChatSessionRequest input, [FromServices] ChatSessionService sessions, [FromServices] ChatOptions options)
    {
        var nickname = ChatValidation.Nickname(input.Nickname, options);
        var current = sessions.Current(HttpContext);
        if (current is { Active: true })
        {
            if (string.Equals(current.Response.Guest.Nickname, nickname, StringComparison.Ordinal))
                return Results.Ok(current.Response);
            var renamed = sessions.Rename(current, nickname) ?? throw new ChatException("session_expired", "会话已失效，请重新加入。", 401);
            return Results.Ok(renamed.Response);
        }

        var session = sessions.Create(HttpContext, nickname);
        return Results.Created("/api/chat/session", session.Response);
    }

    [HttpGet("/api/chat/session")]
    [Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("读取当前匿名会话信息。")]
    public IResult GetSession([FromServices] ChatSessionService sessions)
        => Results.Ok(sessions.Require(HttpContext.User).Response);

    [HttpDelete("/api/chat/session")]
    [AllowAnonymous]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("退出并销毁当前匿名会话。")]
    public IResult DeleteSession([FromServices] ChatSessionService sessions, [FromServices] ChatPresenceService presence)
    {
        sessions.Logout(HttpContext, presence);
        return Results.NoContent();
    }

    [HttpGet("/api/chat/messages")]
    [Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("按游标分页读取历史消息。")]
    public IResult Messages([FromQuery] string? beforeId, [FromQuery] string? afterId, [FromQuery] int? limit,
        [FromServices] ChatRepository repository, [FromServices] ChatOptions options)
    {
        if (beforeId is not null && afterId is not null) throw new ChatException("invalid_cursor", "不能同时指定 beforeId 和 afterId。");
        if (limit < 1 || limit > options.MaxHistoryPageSize) throw new ChatException("invalid_limit", $"每页数量须为 1–{options.MaxHistoryPageSize}。");
        return Results.Ok(repository.History(Cursor(beforeId), Cursor(afterId), limit ?? options.HistoryPageSize));
    }

    [HttpGet("/api/chat/messages/{id}/context")]
    [Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("读取指定消息前后的上下文。")]
    public IResult Context([FromRoute] string id, [FromServices] ChatRepository repository)
    {
        var context = repository.Context(Cursor(id)!.Value);
        return context is null ? Results.NotFound() : Results.Ok(context);
    }

    [HttpGet("/api/chat/participants")]
    [Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("在线与最近出现的参与者列表。")]
    public IResult Participants([FromServices] ChatRepository repository, [FromServices] ChatPresenceService presence)
    {
        var online = presence.OnlineGuests;
        return Results.Ok(online.Select(chatGuest => new ChatParticipant(chatGuest.Id, chatGuest.Nickname, chatGuest.AvatarSeed, true))
            .Concat(repository.RecentGuests().Where(chatGuest => online.All(active => active.Id != chatGuest.Id)).Select(chatGuest => new ChatParticipant(chatGuest.Id, chatGuest.Nickname, chatGuest.AvatarSeed, false))).Take(200).ToArray());
    }

    [HttpGet("/api/chat/status")]
    [Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
    [EnableRateLimiting("chat-http")]
    [EndpointSummary("在线人数与聊天室限制参数。")]
    public IResult Status([FromServices] ChatPresenceService presence, [FromServices] ChatOptions options)
        => Results.Ok(new ChatStatus(presence.OnlineUsers, DateTimeOffset.UtcNow, options.MessageCleanupEnabled, options.RetentionDays, options.MaxMessageChars, options.MaxMessageBytes));

    [HttpGet("/api/chat/admin/session")]
    [Authorize]
    [EnableRateLimiting("chat-admin-auth")]
    [EndpointSummary("校验管理凭据是否有效。")]
    public IResult AdminSession() => Results.NoContent();

    [HttpDelete("/api/chat/admin/messages/{id}")]
    [Authorize]
    [EnableRateLimiting("chat-admin-write")]
    [EndpointSummary("删除指定消息，permanent=true 时永久清除。")]
    public async Task<IResult> DeleteMessage([FromRoute] string id, [FromQuery] bool? permanent,
        [FromServices] ChatService service, [FromServices] ChatRepository repository, [FromServices] ChatBroadcastQueue broadcasts)
    {
        // Minimal API 的 bool? 绑定失败返回 400；MVC 关闭自动 400 后在此显式恢复。
        if (!ModelState.IsValid) return Results.BadRequest();
        var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
        var actor = "access_code_v" + ApiAuthorization.GetVersion(HttpContext.User).ToString(CultureInfo.InvariantCulture);
        var deletedAt = DateTimeOffset.UtcNow;
        await service.Gate.WaitAsync(HttpContext.RequestAborted);
        try
        {
            using var reservation = broadcasts.Reserve();
            HttpContext.RequestAborted.ThrowIfCancellationRequested();
            var purge = permanent == true;
            if (!repository.DeleteMessage(target, purge, deletedAt, actor, purge ? "admin_purge" : "admin_delete", out var revision, out _))
                return Results.NotFound();
            reservation.Publish("message.deleted", new ChatDeleted(target, deletedAt, purge, checked((int)revision)));
            return Results.NoContent();
        }
        finally
        {
            service.Gate.Release();
        }
    }

    [HttpPost("/api/chat/admin/messages/{id}/restore")]
    [Authorize]
    [EnableRateLimiting("chat-admin-write")]
    [EndpointSummary("恢复已删除的指定消息。")]
    public async Task<IResult> RestoreMessage([FromRoute] string id,
        [FromServices] ChatService service, [FromServices] ChatRepository repository, [FromServices] ChatBroadcastQueue broadcasts)
    {
        var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
        var actor = "access_code_v" + ApiAuthorization.GetVersion(HttpContext.User).ToString(CultureInfo.InvariantCulture);
        await service.Gate.WaitAsync(HttpContext.RequestAborted);
        try
        {
            using var reservation = broadcasts.Reserve();
            HttpContext.RequestAborted.ThrowIfCancellationRequested();
            var message = repository.RestoreMessage(target, actor, "admin_restore");
            if (message is null) return Results.NotFound();
            reservation.Publish("message.restored", message);
            return Results.Ok(message);
        }
        finally
        {
            service.Gate.Release();
        }
    }

    private static long? Cursor(string? value)
    {
        if (value is null) return null;
        if (!long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var cursor) || cursor < 1) throw new ChatException("invalid_cursor", "消息游标无效。");
        return cursor;
    }
}

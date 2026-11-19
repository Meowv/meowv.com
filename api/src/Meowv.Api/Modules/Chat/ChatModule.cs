using System.Globalization;
using Meowv.Api.Core;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatModule : IEndpointModule
{
    public string Name => "chat";
    public string Description => "匿名公共聊天室、历史消息与内容管理。";
    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<ChatMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var chat = endpoints.MapGroup("/api/chat");

        chat.MapGet("/health", (ChatRuntime runtime) => Results.Json(new ChatHealth(runtime.Ready ? "ready" : "unavailable"), ChatJsonContext.Default.ChatHealth,
            statusCode: runtime.Ready ? 200 : 503)).AllowAnonymous();
        if (!endpoints.ServiceProvider.GetRequiredService<ChatOptions>().Enabled) return;

        chat.MapPost("/session", (ChatSessionRequest input, HttpContext context, ChatSessionService sessions, ChatOptions options) =>
        {
            var nickname = ChatValidation.Nickname(input.Nickname, options);
            var current = sessions.Current(context);
            if (current is { Active: true })
            {
                if (string.Equals(current.Response.Guest.Nickname, nickname, StringComparison.Ordinal))
                    return Results.Ok(current.Response);
                var renamed = sessions.Rename(current, nickname) ?? throw new ChatException("session_expired", "会话已失效，请重新加入。", 401);
                return Results.Ok(renamed.Response);
            }

            var session = sessions.Create(context, nickname);
            return Results.Created("/api/chat/session", session.Response);
        }).AllowAnonymous().RequireRateLimiting("chat-session");

        chat.MapGet("/session", (HttpContext context, ChatSessionService sessions) => Results.Ok(sessions.Require(context.User).Response))
            .RequireAuthorization(ChatGuestAuthenticationHandler.SchemeName).RequireRateLimiting("chat-http");

        chat.MapDelete("/session", (HttpContext context, ChatSessionService sessions, ChatPresenceService presence) =>
        {
            sessions.Logout(context, presence);
            return Results.NoContent();
        }).AllowAnonymous().RequireRateLimiting("chat-http");

        var guest = chat.MapGroup("").RequireAuthorization(ChatGuestAuthenticationHandler.SchemeName);

        guest.MapGet("/messages", (string? beforeId, string? afterId, int? limit, ChatRepository repository, ChatOptions options) =>
        {
            if (beforeId is not null && afterId is not null) throw new ChatException("invalid_cursor", "不能同时指定 beforeId 和 afterId。");
            if (limit < 1 || limit > options.MaxHistoryPageSize) throw new ChatException("invalid_limit", $"每页数量须为 1–{options.MaxHistoryPageSize}。");
            return Results.Ok(repository.History(Cursor(beforeId), Cursor(afterId), limit ?? options.HistoryPageSize));
        }).RequireRateLimiting("chat-http");

        guest.MapGet("/messages/{id}/context", (string id, ChatRepository repository) =>
        {
            var context = repository.Context(Cursor(id)!.Value);
            return context is null ? Results.NotFound() : Results.Ok(context);
        }).RequireRateLimiting("chat-http");

        guest.MapGet("/participants", (ChatRepository repository, ChatPresenceService presence) =>
        {
            var online = presence.OnlineGuests;
            return Results.Ok(online.Select(chatGuest => new ChatParticipant(chatGuest.Id, chatGuest.Nickname, chatGuest.AvatarSeed, true))
                .Concat(repository.RecentGuests().Where(chatGuest => online.All(active => active.Id != chatGuest.Id)).Select(chatGuest => new ChatParticipant(chatGuest.Id, chatGuest.Nickname, chatGuest.AvatarSeed, false))).Take(200).ToArray());
        }).RequireRateLimiting("chat-http");

        guest.MapGet("/status", (ChatPresenceService presence, ChatOptions options) => Results.Ok(new ChatStatus(presence.OnlineUsers, DateTimeOffset.UtcNow, options.MessageCleanupEnabled, options.RetentionDays, options.MaxMessageChars, options.MaxMessageBytes)))
            .RequireRateLimiting("chat-http");

        chat.MapHub<ChatHub>("/hub", transport => transport.CloseOnAuthenticationExpiration = true)
            .RequireAuthorization(ChatGuestAuthenticationHandler.SchemeName)
            .WithMetadata(new EndpointAccessMetadata("ChatGuest 匿名会话 Cookie + 可信 Origin"))
            .RequireRateLimiting("chat-http");

        var admin = chat.MapGroup("/admin").RequireAuthorization().RequireRateLimiting("chat-admin-write");

        admin.MapGet("/session", Results.NoContent).RequireRateLimiting("chat-admin-auth");

        admin.MapDelete("/messages/{id}", async (string id, bool? permanent, ChatService service, ChatRepository repository, ChatBroadcastQueue broadcasts, HttpContext context) =>
        {
            var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
            var actor = "access_code_v" + ApiAuthorization.GetVersion(context.User).ToString(CultureInfo.InvariantCulture);
            var deletedAt = DateTimeOffset.UtcNow;
            await service.Gate.WaitAsync(context.RequestAborted);
            try
            {
                using var reservation = broadcasts.Reserve();
                context.RequestAborted.ThrowIfCancellationRequested();
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
        });
        admin.MapPost("/messages/{id}/restore", async (string id, ChatService service, ChatRepository repository, ChatBroadcastQueue broadcasts, HttpContext context) =>
        {
            var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
            var actor = "access_code_v" + ApiAuthorization.GetVersion(context.User).ToString(CultureInfo.InvariantCulture);
            await service.Gate.WaitAsync(context.RequestAborted);
            try
            {
                using var reservation = broadcasts.Reserve();
                context.RequestAborted.ThrowIfCancellationRequested();
                var message = repository.RestoreMessage(target, actor, "admin_restore");
                if (message is null) return Results.NotFound();
                reservation.Publish("message.restored", message);
                return Results.Ok(message);
            }
            finally
            {
                service.Gate.Release();
            }
        });
    }

    private static long? Cursor(string? value)
    {
        if (value is null) return null;
        if (!long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var cursor) || cursor < 1) throw new ChatException("invalid_cursor", "消息游标无效。");
        return cursor;
    }
}
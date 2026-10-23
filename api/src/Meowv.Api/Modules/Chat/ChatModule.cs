using System.Globalization;
using System.Threading.RateLimiting;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.SignalR;

namespace Meowv.Api.Modules.Chat;

public static class ChatRegistration
{
    public static IServiceCollection AddChatModule(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new ChatOptions();
        try
        {
            configuration.GetSection("Modules:Chat").Bind(options);
        }
        catch (InvalidOperationException)
        {
            options.Enabled = false;
        }

        services.AddSingleton(options);
        services.Configure<ApiCorsOptions>(configuration.GetSection("Cors"));
        services.AddSingleton<IEndpointModule, ChatModule>();
        services.AddSingleton<ChatRepository>();
        services.AddSingleton<ChatSessionService>();
        services.AddSingleton<ChatPresenceService>();
        services.AddSingleton<ChatSendLimiter>();
        services.AddSingleton<ChatService>();
        services.AddSingleton<ChatRuntime>();
        services.AddHostedService(provider => provider.GetRequiredService<ChatRuntime>());
        services.ConfigureHttpJsonOptions(json => json.SerializerOptions.TypeInfoResolverChain.Add(ChatJsonContext.Default));
        services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, ChatGuestAuthenticationHandler>(ChatGuestAuthenticationHandler.SchemeName, _ => { });
        services.AddAuthorization(auth => auth.AddPolicy(ChatGuestAuthenticationHandler.SchemeName, policy =>
            policy.AddAuthenticationSchemes(ChatGuestAuthenticationHandler.SchemeName).RequireAuthenticatedUser()));
        services.AddSignalR(hub =>
        {
            hub.MaximumReceiveMessageSize = 16 * 1024;
            hub.MaximumParallelInvocationsPerClient = 1;
            hub.EnableDetailedErrors = false;
        }).AddJsonProtocol(json => json.PayloadSerializerOptions.TypeInfoResolver = ChatJsonContext.Default);

        services.AddRateLimiter(limits =>
        {
            limits.AddPolicy("chat-session", context => RateLimitPartition.GetFixedWindowLimiter(Ip(context), _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Clamp(options.SessionsPerWindow, 1, 1000), Window = TimeSpan.FromMinutes(Math.Clamp(options.SessionWindowMinutes, 1, 1440)), QueueLimit = 0,
            }));
            limits.AddPolicy("chat-http", context => RateLimitPartition.GetFixedWindowLimiter(Ip(context), _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 180, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            limits.AddPolicy("chat-admin-auth", context => RateLimitPartition.GetFixedWindowLimiter(Ip(context), _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }

    private static string Ip(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}

public sealed class ChatModule : IEndpointModule
{
    public string Name => "chat";
    public string Description => "匿名公共聊天室、历史消息与内容管理。";
    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<ChatMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var chat = endpoints.MapGroup("/api/chat");

        chat.MapGet("/health", (ChatRuntime runtime) => Results.Json(new ChatHealth(runtime.Ready ? "ready" : "unavailable"), ChatJsonContext.Default.ChatHealth,
            statusCode: runtime.Ready ? 200 : 503));
        if (!endpoints.ServiceProvider.GetRequiredService<ChatOptions>().Enabled) return;

        chat.MapPost("/session", (ChatSessionRequest input, HttpContext context, ChatSessionService sessions, ChatOptions options) =>
        {
            var current = sessions.Current(context);
            if (current is { Active: true }) return Results.Ok(current.Response);
            var session = sessions.Create(context, ChatValidation.Nickname(input.Nickname, options));
            return Results.Created("/api/chat/session", session.Response);
        }).RequireRateLimiting("chat-session");

        chat.MapGet("/session", (HttpContext context, ChatSessionService sessions) => Results.Ok(sessions.Require(context.User).Response))
            .RequireAuthorization(ChatGuestAuthenticationHandler.SchemeName).RequireRateLimiting("chat-http");

        chat.MapDelete("/session", (HttpContext context, ChatSessionService sessions, ChatPresenceService presence) =>
        {
            sessions.Logout(context, presence);
            return Results.NoContent();
        }).RequireRateLimiting("chat-http");

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

        var admin = chat.MapGroup("/admin").RequireAuthorization().RequireRateLimiting("chat-http");

        admin.MapGet("/session", Results.NoContent).RequireRateLimiting("chat-admin-auth");

        admin.MapDelete("/messages/{id}", async (string id, bool? permanent, ChatService service, ChatRepository repository, IHubContext<ChatHub> hub) =>
        {
            var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
            await service.Gate.WaitAsync();
            try
            {
                if (!repository.DeleteMessage(target, permanent == true)) return Results.NotFound();
                await hub.Clients.All.SendAsync("message.deleted", new ChatDeleted(target, DateTimeOffset.UtcNow, permanent == true, repository.Message(target)?.Revision ?? 0));
                return Results.NoContent();
            }
            finally
            {
                service.Gate.Release();
            }
        });
        admin.MapPost("/messages/{id}/restore", async (string id, ChatService service, ChatRepository repository, IHubContext<ChatHub> hub) =>
        {
            var target = Cursor(id)!.Value.ToString(CultureInfo.InvariantCulture);
            await service.Gate.WaitAsync();
            try
            {
                var message = repository.RestoreMessage(target);
                if (message is null) return Results.NotFound();
                await hub.Clients.All.SendAsync("message.restored", message);
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
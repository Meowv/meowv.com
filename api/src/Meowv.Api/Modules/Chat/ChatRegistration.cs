using System.Threading.RateLimiting;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;

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

        // 会话、限流与在线状态均为进程内状态；当前模块按单实例部署设计。
        services.AddSingleton(options);
        services.Configure<ApiCorsOptions>(configuration.GetSection("Cors"));
        services.AddSingleton<IEndpointModule, ChatModule>();
        services.AddSingleton<ChatRepository>();
        services.AddSingleton<ChatSessionService>();
        services.AddSingleton<ChatPresenceService>();
        services.AddSingleton<ChatSendLimiter>();
        services.AddSingleton<ChatBroadcastQueue>();
        services.AddHostedService(provider => provider.GetRequiredService<ChatBroadcastQueue>());
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
            limits.AddPolicy("chat-admin-write", context => RateLimitPartition.GetFixedWindowLimiter(Ip(context), _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }

    private static string Ip(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
namespace Meowv.Api.Modules.Chat.Api;

public sealed class ChatModule : IEndpointModule
{
    public string Name => "chat";

    public string Description => "匿名公共聊天室、历史消息与内容管理。";

    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<ChatMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        if (!endpoints.ServiceProvider.GetRequiredService<ChatOptions>().Enabled) return;
        endpoints.MapHub<ChatHub>("/api/chat/hub", transport => transport.CloseOnAuthenticationExpiration = true)
            .WithSummary("SignalR 实时消息通道。")
            .RequireAuthorization(ChatGuestAuthenticationHandler.SchemeName)
            .WithMetadata(new EndpointAccessMetadata("ChatGuest 匿名会话 Cookie + 可信 Origin"))
            .RequireRateLimiting("chat-http");
    }
}
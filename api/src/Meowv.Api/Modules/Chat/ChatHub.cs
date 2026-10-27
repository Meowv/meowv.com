using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Meowv.Api.Modules.Chat;

[Authorize(Policy = ChatGuestAuthenticationHandler.SchemeName)]
public sealed class ChatHub(ChatSessionService sessions, ChatPresenceService presence, ChatService service) : Hub
{
    public override async Task OnConnectedAsync()
    {
        try
        {
            var session = sessions.Require(Context.User!);
            presence.Add(Context.ConnectionId, session, Context.Abort);
        }
        catch (ChatException error)
        {
            Context.Abort();
            throw new HubException(error.Code + ": " + error.Message);
        }

        await Clients.All.SendAsync("presence.changed", new ChatPresence(presence.OnlineUsers));
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        presence.Remove(Context.ConnectionId);
        await Clients.All.SendAsync("presence.changed", new ChatPresence(presence.OnlineUsers));
        await base.OnDisconnectedAsync(exception);
    }

    public async Task<ChatAck> SendMessage(string clientMessageId, string content, string? replyToId, ChatMentionRequest[]? mentions)
    {
        try
        {
            return await service.SendAsync(Context.User!, Context.GetHttpContext()?.Connection.RemoteIpAddress?.ToString() ?? "unknown", clientMessageId, content, replyToId, mentions, Context.ConnectionAborted);
        }
        catch (ChatException error)
        {
            throw new HubException(error.Code + ": " + error.Message);
        }
        catch (Microsoft.Data.Sqlite.SqliteException)
        {
            throw new HubException("chat_unavailable: 消息暂时无法保存，请稍后重试。");
        }
    }
}
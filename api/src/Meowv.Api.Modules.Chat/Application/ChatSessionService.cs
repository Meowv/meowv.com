using System.Security.Cryptography;

namespace Meowv.Api.Modules.Chat.Application;

public sealed class ChatSessionService(ChatRepository repository)
{
    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));

    internal ChatSession? ByToken(string? token) =>
        token is { Length: 64 } ? repository.FindSession(Hash(token)) : null;

    internal ChatSession? ByHash(string? hash) =>
        hash is null ? null : repository.FindSession(hash);

    internal ChatSession Require(CallerContext caller)
    {
        var session = ByHash(caller.SessionHash);
        return session is not { Active: true } ? throw new ChatException("session_expired", "会话已失效，请重新加入。", 401) : session;
    }

    internal (ChatSession Session, string Token) Create(string nickname)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var session = repository.CreateSession(Hash(token), nickname);
        return (session, token);
    }

    internal ChatSession? Rename(ChatSession session, string nickname) => repository.RenameSession(session.TokenHash, nickname);

    internal void Logout(string? token, ChatPresenceService presence)
    {
        var session = ByToken(token);
        if (session is null) return;
        repository.Revoke(session.TokenHash);
        presence.Disconnect(session.Guest.Id);
    }
}
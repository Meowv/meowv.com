using System.Security.Cryptography;
using System.Security.Claims;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatSessionService(ChatRepository repository)
{
    public const string CookieName = "meowv_chat_session";
    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));

    internal ChatSession? Current(HttpContext context)
    {
        var token = context.Request.Cookies[CookieName];
        return token is { Length: 64 } ? repository.FindSession(Hash(token)) : null;
    }

    internal ChatSession Require(ClaimsPrincipal principal)
    {
        var hash = principal.FindFirst("chat_hash")?.Value;
        var session = hash is null ? null : repository.FindSession(hash);
        return session is not { Active: true } ? throw new ChatException("session_expired", "会话已失效，请重新加入。", 401) : session;
    }

    internal ChatSession Create(HttpContext context, string nickname)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var session = repository.CreateSession(Hash(token), nickname);
        context.Response.Cookies.Append(CookieName, token, CookieOptions(context, session.ExpiresAt));
        return session;
    }

    internal ChatSession? Rename(ChatSession session, string nickname) => repository.RenameSession(session.TokenHash, nickname);

    internal void Logout(HttpContext context, ChatPresenceService presence)
    {
        var session = Current(context);
        if (session is not null)
        {
            repository.Revoke(session.TokenHash);
            presence.Disconnect(session.Guest.Id);
        }

        context.Response.Cookies.Delete(CookieName, CookieOptions(context, null));
    }

    private static CookieOptions CookieOptions(HttpContext context, DateTimeOffset? expires) => new()
    {
        HttpOnly = true, Secure = !context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment() || context.Request.IsHttps,
        SameSite = SameSiteMode.Strict, Path = "/api/chat", Expires = expires,
        MaxAge = expires.HasValue ? expires.Value - DateTimeOffset.UtcNow : null, IsEssential = true,
    };
}
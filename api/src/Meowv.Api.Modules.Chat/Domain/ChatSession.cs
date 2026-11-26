namespace Meowv.Api.Modules.Chat.Domain;

internal sealed record ChatSession(string TokenHash, ChatGuest Guest, DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt)
{
    public bool Active => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
    public ChatSessionResponse Response => new(Guest, ExpiresAt);
}
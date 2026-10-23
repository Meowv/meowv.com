using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Chat;

public sealed record ChatGuest(string Id, string Nickname, string AvatarSeed);

public sealed record ChatSessionResponse(ChatGuest Guest, DateTimeOffset ExpiresAt);

public sealed record ChatSessionRequest(string? Nickname);

public sealed record ChatMessage(string Id, string ClientMessageId, string GuestId, string Nickname, string AvatarSeed, string Content, DateTimeOffset CreatedAt, bool Deleted, int Revision, ChatReply? Reply = null, ChatMention[]? Mentions = null);

public sealed record ChatMentionRequest(string GuestId, int Start, int Length);

public sealed record ChatMention(string GuestId, string Nickname, int Start, int Length);

public sealed record ChatParticipant(string Id, string Nickname, string AvatarSeed, bool Online);

public sealed record ChatReply(string Id, string Nickname, string Content, bool Deleted, bool Unavailable, int Revision);

public sealed record ChatMessageContext(ChatMessage[] Items, bool HasMoreBefore, bool HasMoreAfter);

public sealed record ChatMessagePage(ChatMessage[] Items, bool HasMore, string? NextCursor);

public sealed record ChatAck(string Id, string ClientMessageId, DateTimeOffset CreatedAt, ChatReply? Reply = null, ChatMention[]? Mentions = null);

public sealed record ChatDeleted(string Id, DateTimeOffset DeletedAt, bool Permanent, int Revision);

public sealed record ChatPresence(int OnlineUsers);

public sealed record ChatStatus(int OnlineUsers, DateTimeOffset ServerTime, bool MessageCleanupEnabled, int RetentionDays, int MaxMessageChars, int MaxMessageBytes);

public sealed record ChatError(string Code, string Message);

public sealed record ChatHealth(string Status);

internal sealed record ChatSession(string TokenHash, ChatGuest Guest, DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt)
{
    public bool Active => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
    public ChatSessionResponse Response => new(Guest, ExpiresAt);
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ChatSessionRequest))]
[JsonSerializable(typeof(ChatSessionResponse))]
[JsonSerializable(typeof(ChatMessage))]
[JsonSerializable(typeof(ChatMentionRequest[]))]
[JsonSerializable(typeof(ChatMention[]))]
[JsonSerializable(typeof(ChatParticipant[]))]
[JsonSerializable(typeof(ChatMessagePage))]
[JsonSerializable(typeof(ChatMessageContext))]
[JsonSerializable(typeof(ChatAck))]
[JsonSerializable(typeof(ChatDeleted))]
[JsonSerializable(typeof(ChatPresence))]
[JsonSerializable(typeof(ChatStatus))]
[JsonSerializable(typeof(ChatError))]
[JsonSerializable(typeof(ChatHealth))]
[JsonSerializable(typeof(string))]
public partial class ChatJsonContext : JsonSerializerContext;
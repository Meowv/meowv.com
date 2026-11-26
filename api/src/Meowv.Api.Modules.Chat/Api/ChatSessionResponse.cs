namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatSessionResponse(ChatGuest Guest, DateTimeOffset ExpiresAt);
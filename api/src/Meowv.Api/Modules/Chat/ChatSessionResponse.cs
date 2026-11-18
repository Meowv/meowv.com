namespace Meowv.Api.Modules.Chat;

public sealed record ChatSessionResponse(ChatGuest Guest, DateTimeOffset ExpiresAt);
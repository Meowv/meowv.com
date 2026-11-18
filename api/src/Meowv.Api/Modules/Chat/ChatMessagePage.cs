namespace Meowv.Api.Modules.Chat;

public sealed record ChatMessagePage(ChatMessage[] Items, bool HasMore, string? NextCursor);
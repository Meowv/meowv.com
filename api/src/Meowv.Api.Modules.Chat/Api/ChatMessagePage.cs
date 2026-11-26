namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatMessagePage(ChatMessage[] Items, bool HasMore, string? NextCursor);
namespace Meowv.Api.Modules.Chat;

public sealed record ChatMessageContext(ChatMessage[] Items, bool HasMoreBefore, bool HasMoreAfter);
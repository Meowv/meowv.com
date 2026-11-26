namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatMessageContext(ChatMessage[] Items, bool HasMoreBefore, bool HasMoreAfter);
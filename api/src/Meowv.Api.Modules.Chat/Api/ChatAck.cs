namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatAck(string Id, string ClientMessageId, DateTimeOffset CreatedAt, ChatReply? Reply = null, ChatMention[]? Mentions = null);
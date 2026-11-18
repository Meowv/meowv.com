namespace Meowv.Api.Modules.Chat;

public sealed record ChatMessage(string Id, string ClientMessageId, string GuestId, string Nickname, string AvatarSeed, string Content, DateTimeOffset CreatedAt, bool Deleted, int Revision, ChatReply? Reply = null, ChatMention[]? Mentions = null);
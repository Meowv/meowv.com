namespace Meowv.Api.Modules.Chat.Domain;

public sealed record ChatReply(string Id, string Nickname, string Content, bool Deleted, bool Unavailable, int Revision);
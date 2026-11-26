namespace Meowv.Api.Modules.Chat.Domain;

public sealed record ChatMention(string GuestId, string Nickname, int Start, int Length);
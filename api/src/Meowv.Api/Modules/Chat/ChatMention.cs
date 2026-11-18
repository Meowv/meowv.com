namespace Meowv.Api.Modules.Chat;

public sealed record ChatMention(string GuestId, string Nickname, int Start, int Length);
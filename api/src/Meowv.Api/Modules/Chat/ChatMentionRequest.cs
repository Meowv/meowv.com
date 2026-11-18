namespace Meowv.Api.Modules.Chat;

public sealed record ChatMentionRequest(string GuestId, int Start, int Length);
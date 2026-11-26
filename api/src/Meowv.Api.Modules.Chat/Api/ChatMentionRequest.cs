namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatMentionRequest(string GuestId, int Start, int Length);
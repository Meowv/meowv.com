namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatParticipant(string Id, string Nickname, string AvatarSeed, bool Online);
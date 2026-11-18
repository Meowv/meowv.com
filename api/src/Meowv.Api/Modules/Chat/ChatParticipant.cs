namespace Meowv.Api.Modules.Chat;

public sealed record ChatParticipant(string Id, string Nickname, string AvatarSeed, bool Online);
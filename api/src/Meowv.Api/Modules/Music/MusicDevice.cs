namespace Meowv.Api.Modules.Music;

public sealed record MusicDevice(string Id, string Alias, DateTime CreatedAt, DateTime? LastUsedAt, DateTime? RevokedAt);
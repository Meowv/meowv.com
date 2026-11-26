namespace Meowv.Api.Modules.Music.Domain;

public sealed record MusicDeviceRegister(string? InstallationId, string? PublicKey, string? Model, string? OsVersion);

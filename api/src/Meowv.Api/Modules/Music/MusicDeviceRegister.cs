namespace Meowv.Api.Modules.Music;

public sealed record MusicDeviceRegister(string? InstallationId, string? PublicKey, string? Model, string? OsVersion);
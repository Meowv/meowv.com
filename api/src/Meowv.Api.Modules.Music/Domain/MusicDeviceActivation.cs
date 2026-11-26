namespace Meowv.Api.Modules.Music.Domain;

public sealed record MusicDeviceActivation(string InstallationId, string DeviceId, string DeviceCode, string Status);

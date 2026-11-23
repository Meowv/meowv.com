namespace Meowv.Api.Modules.Music;

public sealed record MusicDeviceActivation(string InstallationId, string DeviceId, string DeviceCode, string Status);
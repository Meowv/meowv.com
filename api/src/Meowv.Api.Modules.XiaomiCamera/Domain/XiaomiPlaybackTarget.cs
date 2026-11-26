namespace Meowv.Api.Modules.XiaomiCamera.Domain;

public readonly record struct XiaomiPlaybackTarget(string DeviceFingerprint, long SessionVersion, Guid StreamId);
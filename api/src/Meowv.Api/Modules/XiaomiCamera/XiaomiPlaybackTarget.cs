namespace Meowv.Api.Modules.XiaomiCamera;

public readonly record struct XiaomiPlaybackTarget(string DeviceFingerprint, long SessionVersion, Guid StreamId);
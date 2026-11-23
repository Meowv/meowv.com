namespace Meowv.Api.Modules.Music;

public sealed record MusicDevice(
    string InstallationId,
    string DeviceId,
    string DeviceCode,
    string Model,
    string OsVersion,
    string Status,
    DateTime CreatedAt,
    DateTime? ActivatedAt,
    DateTime? LastSeen,
    DateTime? RevokedAt,
    string KeyFingerprint);
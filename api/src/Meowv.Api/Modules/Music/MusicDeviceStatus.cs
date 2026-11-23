using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music;

public sealed record MusicDeviceStatus(
    string InstallationId,
    string DeviceCode,
    string Status,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? EncryptedToken = null);
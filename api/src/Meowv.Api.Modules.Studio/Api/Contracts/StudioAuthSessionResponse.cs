using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAuthSessionResponse
{
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("expires_at")] public DateTimeOffset ExpiresAt { get; set; }

    public StudioUserProfileResponse User { get; set; } = new();
}
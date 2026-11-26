using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioRegisterResponse
{
    [JsonPropertyName("requires_verification")]
    public bool RequiresVerification { get; set; }

    public string? Token { get; set; }

    [JsonPropertyName("expires_at")] public DateTimeOffset? ExpiresAt { get; set; }

    public StudioUserProfileResponse? User { get; set; }

    public string Message { get; set; } = string.Empty;
}
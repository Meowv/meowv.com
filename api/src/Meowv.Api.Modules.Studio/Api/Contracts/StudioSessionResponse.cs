using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioSessionResponse
{
    public Guid Id { get; set; }

    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("expires_at")] public DateTimeOffset ExpiresAt { get; set; }

    [JsonPropertyName("is_current")] public bool IsCurrent { get; set; }

    [JsonPropertyName("user_agent")] public string? UserAgent { get; set; }
}
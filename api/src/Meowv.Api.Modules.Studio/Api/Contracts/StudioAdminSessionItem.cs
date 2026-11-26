using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAdminSessionItem
{
    public Guid Id { get; set; }

    [JsonPropertyName("token_id")] public string TokenId { get; set; } = string.Empty;

    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("expires_at")] public DateTimeOffset ExpiresAt { get; set; }

    [JsonPropertyName("revoked_at")] public DateTimeOffset? RevokedAt { get; set; }

    [JsonPropertyName("user_agent")] public string? UserAgent { get; set; }

    public bool Active { get; set; }
}
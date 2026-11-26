using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAdminUserItem
{
    public Guid Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = "user";

    [JsonPropertyName("email_verified")] public bool EmailVerified { get; set; }

    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }

    public long Revision { get; set; }

    [JsonPropertyName("session_count")] public int SessionCount { get; set; }
}
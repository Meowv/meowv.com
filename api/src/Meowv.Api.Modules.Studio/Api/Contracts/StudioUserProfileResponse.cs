using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioUserProfileResponse
{
    public Guid Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = "user";

    [JsonPropertyName("email_verified")] public bool EmailVerified { get; set; }

    [JsonPropertyName("avatar_url")] public string? AvatarUrl { get; set; }

    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }

    public long Revision { get; set; }

    public static StudioUserProfileResponse From(StudioUser user)
    {
        return new StudioUserProfileResponse
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            Role = StudioAccountRules.ToWire(user.Role),
            EmailVerified = user.EmailVerified,
            AvatarUrl = user.AvatarPath is null ? null : $"/api/studio/user/avatar?v={user.Revision}",
            CreatedAt = user.CreatedAt,
            Revision = user.Revision
        };
    }
}
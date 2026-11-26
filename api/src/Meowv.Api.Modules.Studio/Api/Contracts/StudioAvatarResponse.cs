using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAvatarResponse
{
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("avatar_url")] public string AvatarUrl { get; set; } = string.Empty;
}
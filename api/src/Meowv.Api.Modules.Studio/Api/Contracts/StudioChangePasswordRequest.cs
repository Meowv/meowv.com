using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioChangePasswordRequest
{
    [JsonPropertyName("current_password")] public string CurrentPassword { get; set; } = string.Empty;

    [JsonPropertyName("new_password")] public string NewPassword { get; set; } = string.Empty;
}
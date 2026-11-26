using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioResetPasswordRequest
{
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("new_password")] public string NewPassword { get; set; } = string.Empty;
}
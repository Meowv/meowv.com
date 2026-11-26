using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAuthCapabilitiesResponse
{
    [JsonPropertyName("registration_enabled")]
    public bool RegistrationEnabled { get; set; }

    [JsonPropertyName("email_verification_required")]
    public bool EmailVerificationRequired { get; set; }

    [JsonPropertyName("mail_configured")] public bool MailConfigured { get; set; }

    [JsonPropertyName("password_min_length")]
    public int PasswordMinLength { get; set; }

    [JsonPropertyName("username_min_length")]
    public int UsernameMinLength { get; set; }

    [JsonPropertyName("username_max_length")]
    public int UsernameMaxLength { get; set; }

    [JsonPropertyName("user_count")] public int UserCount { get; set; }
}
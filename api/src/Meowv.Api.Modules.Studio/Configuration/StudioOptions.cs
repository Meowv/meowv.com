namespace Meowv.Api.Modules.Studio.Configuration;

public sealed class StudioOptions
{
    public const string SectionName = "Modules:Studio";

    public bool Enabled { get; set; } = true;

    public bool RegistrationEnabled { get; set; }

    public bool RequireEmailVerification { get; set; } = true;

    public string Issuer { get; set; } = "Studio";

    public string Audience { get; set; } = "Studio";

    public int TokenDays { get; set; } = 30;

    public int EmailVerifyHours { get; set; } = 24;

    public int PasswordResetMinutes { get; set; } = 5;

    public string PublicBaseUrl { get; set; } = string.Empty;

    public string AvatarDirectory { get; set; } = "studio/user-assets";

    public int AvatarMaxBytes { get; set; } = 2 * 1024 * 1024;

    public int DispatcherIntervalSeconds { get; set; } = 15;

    public int DispatcherMaxAttempts { get; set; } = 5;
}
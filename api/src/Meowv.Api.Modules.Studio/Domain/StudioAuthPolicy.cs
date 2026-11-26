namespace Meowv.Api.Modules.Studio.Domain;

public sealed record StudioAuthPolicy(
    bool RegistrationEnabled,
    bool RequireEmailVerification,
    int EmailVerifyHours,
    int PasswordResetMinutes,
    string PublicBaseUrl,
    int TokenDays,
    string Issuer,
    string Audience);
namespace Meowv.Api.Modules.Studio.Domain;

public static class StudioErrorCodes
{
    public const string Validation = "validation_failed";
    public const string Conflict = "conflict";
    public const string InvalidCredentials = "invalid_credentials";
    public const string EmailUnverified = "email_unverified";
    public const string Unauthorized = "unauthorized";
    public const string Forbidden = "forbidden";
    public const string NotFound = "not_found";
    public const string EmailNotConfigured = "email_not_configured";
    public const string RegistrationDisabled = "registration_disabled";
    public const string Throttled = "throttled";
    public const string LastAdmin = "last_admin";
    public const string SelfDelete = "self_delete";
    public const string InvalidToken = "invalid_token";
    public const string RevisionRequired = "revision_required";
    public const string RevisionConflict = "revision_conflict";
    public const string SessionRevoked = "session_revoked";
    public const string PayloadTooLarge = "payload_too_large";
}
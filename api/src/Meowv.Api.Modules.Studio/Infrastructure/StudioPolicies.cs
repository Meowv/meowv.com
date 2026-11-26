namespace Meowv.Api.Modules.Studio.Infrastructure;

public static class StudioPolicies
{
    public const string SchemeName = "StudioBearer";
    public const string User = "StudioUser";
    public const string Verified = "StudioVerified";
    public const string Admin = "StudioAdmin";
    public const string EmailVerifiedClaim = "studio_email_verified";
    public const string TokenIdClaim = "jti";
    public const string RoleClaim = "role";
}
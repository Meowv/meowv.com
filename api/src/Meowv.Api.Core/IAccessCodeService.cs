using System.Globalization;
using System.Security.Claims;

namespace Meowv.Api.Core;

public interface IAccessCodeService
{
    string? CreateIfMissing();
    string Rotate();
    bool Verify(string? code, out int version);
    int GetVersion();
}

public static class ApiAuthorization
{
    public const string AccessCodeScheme = "ApiAccessCode";
    public const string ManagementScheme = "ApiManagement";
    public const string ManagementPolicy = "ApiManagement";
    public const string VersionClaim = "api_access_code_version";
    public const string CorsPolicy = "api";

    public static int GetVersion(ClaimsPrincipal principal) => int.TryParse(principal.FindFirst(VersionClaim)?.Value, NumberStyles.None, CultureInfo.InvariantCulture, out var version) ? version : 0;
}
using System.Security.Claims;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public static class StudioCurrentUser
{
    public static Guid? Id(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal.FindFirst("sub")?.Value;
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    public static string? TokenId(ClaimsPrincipal principal)
    {
        return principal.FindFirst(StudioPolicies.TokenIdClaim)?.Value ?? principal.FindFirst("jti")?.Value;
    }
}
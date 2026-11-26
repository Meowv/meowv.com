using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    StudioTokenService tokens,
    IStudioStore store,
    IStudioClock clock) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            return AuthenticateResult.NoResult();

        var header = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header)) return AuthenticateResult.NoResult();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.Fail("invalid_token");

        var token = header["Bearer ".Length..].Trim();
        var validated = tokens.Validate(token, clock.UtcNow);
        if (validated is null) return AuthenticateResult.Fail("invalid_token");

        var session = await store.FindActiveSessionAsync(validated.TokenId, clock.UtcNow, Context.RequestAborted);
        if (session is null) return AuthenticateResult.Fail("session_revoked");

        var identity = new ClaimsIdentity(Scheme.Name);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, session.User.Id.ToString("D")));
        identity.AddClaim(new Claim("sub", session.User.Id.ToString("D")));
        identity.AddClaim(new Claim("jti", validated.TokenId));
        identity.AddClaim(new Claim(StudioPolicies.RoleClaim, StudioAccountRules.ToWire(session.User.Role)));
        identity.AddClaim(new Claim(StudioPolicies.EmailVerifiedClaim, session.User.EmailVerified ? "true" : "false"));
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.CacheControl = "no-store";
        var requestId = Context.Items[StudioRequestIdMiddleware.ItemKey] as string;
        await Response.WriteAsJsonAsync(
            new StudioApiError("请先登录。", StudioErrorCodes.Unauthorized, requestId),
            StudioJson.Options,
            Context.RequestAborted);
    }
}
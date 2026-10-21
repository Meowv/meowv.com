using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Meowv.Api.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Security;

public sealed class SecurityOptions
{
    public string BootstrapToken { get; set; } = "";
}

public sealed class ApiAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IAccessCodeService codes,
    IOptions<SecurityOptions> security) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var version = 0;
        if (Scheme.Name == ApiAuthorization.ManagementScheme)
        {
            var token = Request.Headers["X-Api-Bootstrap-Token"];
            if (token.Count == 0) return Task.FromResult(AuthenticateResult.NoResult());
            if (token.Count != 1 || !VerifyManagementToken(token.ToString()))
                return Task.FromResult(AuthenticateResult.Fail("管理密钥无效。"));
        }
        else
        {
            var header = Request.Headers.Authorization;
            if (header.Count == 0) return Task.FromResult(AuthenticateResult.NoResult());
            const string prefix = "Bearer ";
            var value = header.ToString();
            if (header.Count != 1 || !value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ||
                !codes.Verify(value[prefix.Length..].Trim(), out version))
                return Task.FromResult(AuthenticateResult.Fail("授权码无效。"));
        }

        var identity = new ClaimsIdentity(Scheme.Name);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, "service"));
        if (version > 0) identity.AddClaim(new Claim(ApiAuthorization.VersionClaim, version.ToString(CultureInfo.InvariantCulture)));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }

    private bool VerifyManagementToken(string token)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 1024) return false;
        var provided = Encoding.UTF8.GetBytes(token);
        var expected = Encoding.UTF8.GetBytes(security.Value.BootstrapToken);
        try
        {
            return provided.Length == expected.Length && CryptographicOperations.FixedTimeEquals(provided, expected);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(provided);
            CryptographicOperations.ZeroMemory(expected);
        }
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.CacheControl = "no-store";
        if (Scheme.Name == ApiAuthorization.AccessCodeScheme) Response.Headers.WWWAuthenticate = "Bearer";
        var management = Scheme.Name == ApiAuthorization.ManagementScheme;
        return Response.WriteAsJsonAsync(new ApiAuthError(management ? "bootstrap_unauthorized" : "access_code_unauthorized",
            management ? "管理密钥无效。" : "授权码无效。"), AuthJsonContext.Default.ApiAuthError, cancellationToken: Context.RequestAborted);
    }
}
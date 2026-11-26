using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;

namespace Meowv.Api.Platform.Security;

public sealed class ApiAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IAccessCodeService codes, IOptions<SecurityOptions> security) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            return Task.FromResult(AuthenticateResult.NoResult());

        var version = 0;
        if (Scheme.Name == ApiAuthorization.ManagementScheme)
        {
            var token = ApiCredentials.ReadManagementToken(Request);
            MarkQueryCredential(token);
            if (!token.Present) return Task.FromResult(AuthenticateResult.NoResult());
            if (token.State != ApiCredentialState.Valid || !VerifyManagementToken(token.Value!))
                return Task.FromResult(AuthenticateResult.Fail("管理密钥无效。"));
        }
        else
        {
            var credential = ApiCredentials.ReadAccessCode(Request);
            MarkQueryCredential(credential);
            if (!credential.Present) return Task.FromResult(AuthenticateResult.NoResult());
            if (credential.State != ApiCredentialState.Valid || !codes.Verify(credential.Value, out version))
                return Task.FromResult(AuthenticateResult.Fail("授权码无效。"));
        }

        var identity = new ClaimsIdentity(Scheme.Name);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, "service"));
        if (version > 0) identity.AddClaim(new Claim(ApiAuthorization.VersionClaim, version.ToString(CultureInfo.InvariantCulture)));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }

    private void MarkQueryCredential(ApiCredential credential)
    {
        if (!credential.FromQuery) return;
        Response.Headers.CacheControl = "no-store";
        Response.Headers["Referrer-Policy"] = "no-referrer";
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
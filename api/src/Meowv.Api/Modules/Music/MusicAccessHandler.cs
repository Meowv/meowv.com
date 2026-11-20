using System.Security.Claims;
using System.Text.Encodings.Web;
using Meowv.Api.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Music;

public sealed class MusicAccessHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, MusicRuntime runtime, MusicDeviceStore devices) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "MusicDevice";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var credential = ApiCredentials.ReadAccessCode(Request);
        if (!runtime.Available || credential.FromQuery || credential.State != ApiCredentialState.Valid ||
            credential.Value is not { Length: 47 } raw)
            return Task.FromResult(AuthenticateResult.NoResult());

        string? deviceId;
        try
        {
            deviceId = devices.Verify(raw);
        }
        catch (Exception error) when (error is Microsoft.Data.Sqlite.SqliteException or Infrastructure.ApiDatabaseSchemaException)
        {
            Context.Items["MusicCredentialStoreUnavailable"] = true;
            return Task.FromResult(AuthenticateResult.Fail("音乐凭据存储暂不可用。"));
        }

        if (deviceId is null) return Task.FromResult(AuthenticateResult.Fail("音乐访问凭据无效。"));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, deviceId)], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        if (Context.Items.ContainsKey("MusicCredentialStoreUnavailable"))
            return MusicErrors.Write(Context, 503, "source_unavailable", "音乐凭据存储暂不可用。");
        Response.Headers.WWWAuthenticate = "Bearer";
        return MusicErrors.Write(Context, 401, "unauthorized", "请先激活设备并使用有效的音乐访问凭据。");
    }
}
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Music;

public sealed class MusicAccessHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    MusicOptions music,
    MusicRuntime runtime,
    MusicDeviceStore devices) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "MusicDevice";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization;
        if (!runtime.Available || header.Count != 1) return Task.FromResult(AuthenticateResult.NoResult());
        var value = header.ToString();
        if (!value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) || value.Length is < 39 or > 1031)
            return Task.FromResult(AuthenticateResult.NoResult());
        var raw = value[7..];
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

        var provided = SHA256.HashData(Encoding.UTF8.GetBytes(value[7..]));
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(music.TestAccessToken));
        if (deviceId is null && (music.TestAccessToken.Length < 32 || !CryptographicOperations.FixedTimeEquals(provided, expected))) return Task.FromResult(AuthenticateResult.Fail("音乐访问凭据无效。"));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, deviceId ?? "music-test-device")], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        if (Context.Items.ContainsKey("MusicCredentialStoreUnavailable"))
            return MusicErrors.Write(Context, 503, "source_unavailable", "音乐凭据存储暂不可用。");
        Response.Headers.WWWAuthenticate = "Bearer";
        return MusicErrors.Write(Context, 401, "unauthorized", "请配置有效的音乐专用访问凭据。");
    }
}
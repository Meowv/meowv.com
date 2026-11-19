using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Meowv.Api.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Music;

public sealed class MusicAccessHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, MusicOptions music, MusicRuntime runtime, MusicDeviceStore devices) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "MusicDevice";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var credential = ApiCredentials.ReadAccessCode(Request);
        if (!runtime.Available || !credential.Present || credential.State != ApiCredentialState.Valid || credential.Value is not { Length: >= 32 and <= 1024 } raw) return Task.FromResult(AuthenticateResult.NoResult());
        if (credential.FromQuery)
        {
            // 凭据出现在 URL 中，禁止缓存并阻断 Referer 外泄。
            Response.Headers.CacheControl = "no-store";
            Response.Headers["Referrer-Policy"] = "no-referrer";
        }

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

        var provided = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
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
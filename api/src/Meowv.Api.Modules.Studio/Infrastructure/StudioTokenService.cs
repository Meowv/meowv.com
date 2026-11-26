using System.Buffers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioTokenService(StudioJwtKeyProvider keys, StudioOptions options) : IStudioTokenService
{
    private static readonly TimeSpan Skew = TimeSpan.FromSeconds(30);
    private readonly byte[] _key = keys.Key;

    public StudioIssuedToken Issue(StudioUser user, DateTimeOffset now)
    {
        var tokenId = Guid.NewGuid().ToString("N");
        var expiresAt = now.AddDays(Math.Max(1, options.TokenDays));
        var header = EncodeHeader();
        var payload = EncodePayload(user, tokenId, now, expiresAt);
        var signingInput = $"{header}.{payload}";
        var signature = Base64UrlEncode(HMACSHA256.HashData(_key, Encoding.ASCII.GetBytes(signingInput)));
        return new StudioIssuedToken($"{signingInput}.{signature}", tokenId, expiresAt);
    }

    public StudioValidatedToken? Validate(string token, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 4096) return null;

        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        if (!TryBase64UrlDecode(parts[0], out var headerBytes) ||
            !TryBase64UrlDecode(parts[1], out var payloadBytes) ||
            !TryBase64UrlDecode(parts[2], out var signatureBytes))
            return null;

        try
        {
            using (var header = JsonDocument.Parse(headerBytes))
            {
                if (!header.RootElement.TryGetProperty("alg", out var alg) || alg.GetString() != "HS256") return null;
                if (!header.RootElement.TryGetProperty("typ", out var typ) || typ.GetString() != "JWT") return null;
            }

            var expected = HMACSHA256.HashData(_key, Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}"));
            if (!CryptographicOperations.FixedTimeEquals(expected, signatureBytes)) return null;

            using var payload = JsonDocument.Parse(payloadBytes);
            var root = payload.RootElement;

            if (!root.TryGetProperty("iss", out var iss) || iss.GetString() != options.Issuer) return null;
            if (!root.TryGetProperty("aud", out var aud) || aud.GetString() != options.Audience) return null;
            if (!root.TryGetProperty("sub", out var sub) || !Guid.TryParse(sub.GetString(), out var userId)) return null;
            if (!root.TryGetProperty("jti", out var jti) || string.IsNullOrWhiteSpace(jti.GetString())) return null;
            if (!root.TryGetProperty("exp", out var exp) || !exp.TryGetInt64(out var expires)) return null;
            if (!root.TryGetProperty("nbf", out var nbf) || !nbf.TryGetInt64(out var notBefore)) return null;
            if (!root.TryGetProperty("iat", out var iat) || !iat.TryGetInt64(out var issuedAt)) return null;

            var nowSeconds = now.ToUnixTimeSeconds();
            if (expires <= nowSeconds - (long)Skew.TotalSeconds) return null;
            if (notBefore > nowSeconds + (long)Skew.TotalSeconds) return null;
            if (issuedAt > nowSeconds + (long)Skew.TotalSeconds) return null;

            return new StudioValidatedToken(userId, jti.GetString()!, DateTimeOffset.FromUnixTimeSeconds(expires));
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    private string EncodeHeader()
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("alg", "HS256");
            writer.WriteString("typ", "JWT");
            writer.WriteEndObject();
        }

        return Base64UrlEncode(buffer.WrittenSpan);
    }

    private string EncodePayload(StudioUser user, string tokenId, DateTimeOffset now, DateTimeOffset expiresAt)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("sub", user.Id.ToString("D"));
            writer.WriteString("jti", tokenId);
            writer.WriteString("iss", options.Issuer);
            writer.WriteString("aud", options.Audience);
            writer.WriteNumber("iat", now.ToUnixTimeSeconds());
            writer.WriteNumber("nbf", now.ToUnixTimeSeconds());
            writer.WriteNumber("exp", expiresAt.ToUnixTimeSeconds());
            writer.WriteEndObject();
        }

        return Base64UrlEncode(buffer.WrittenSpan);
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> value)
    {
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static bool TryBase64UrlDecode(string value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrEmpty(value)) return false;

        foreach (var ch in value)
        {
            var valid = ch is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9' or '-' or '_';
            if (!valid) return false;
        }

        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch
        {
            0 => padded,
            2 => padded + "==",
            3 => padded + "=",
            _ => string.Empty
        };

        if (padded.Length == 0) return false;

        try
        {
            bytes = Convert.FromBase64String(padded);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
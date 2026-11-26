using System.Globalization;
using System.Security.Cryptography;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioPasswordHasher : IStudioPasswordHasher
{
    private const string Prefix = "pbkdf2-sha256";
    private const int SaltBytes = 16;
    private const int HashBytes = 32;
    public const int Iterations = 210_000;

    public string Hash(string password)
    {
        ArgumentNullException.ThrowIfNull(password);

        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var derived = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return string.Join('$', Prefix, Iterations.ToString(CultureInfo.InvariantCulture), Base64Url(salt), Base64Url(derived));
    }

    public StudioPasswordVerification Verify(string password, string storedHash)
    {
        if (string.IsNullOrEmpty(storedHash)) return new StudioPasswordVerification(false, false);

        var parts = storedHash.Split('$');
        if (parts is not [Prefix, _, _, _] || !int.TryParse(parts[1], out var iterations) || iterations <= 0) return new StudioPasswordVerification(false, false);

        byte[] salt;
        byte[] expected;
        try
        {
            salt = FromBase64Url(parts[2]);
            expected = FromBase64Url(parts[3]);
        }
        catch (FormatException)
        {
            return new StudioPasswordVerification(false, false);
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        var matches = CryptographicOperations.FixedTimeEquals(actual, expected);
        return new StudioPasswordVerification(matches, matches && iterations < Iterations);
    }

    private static string Base64Url(byte[] value)
    {
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch
        {
            2 => padded + "==",
            3 => padded + "=",
            _ => padded
        };
        return Convert.FromBase64String(padded);
    }
}
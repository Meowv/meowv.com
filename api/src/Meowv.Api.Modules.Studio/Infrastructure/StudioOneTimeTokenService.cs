using System.Security.Cryptography;
using System.Text;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioOneTimeTokenService : IStudioOneTimeTokenService
{
    public string CreateToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public string Hash(string token)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}
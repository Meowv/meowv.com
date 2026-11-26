using System.Security.Cryptography;
using System.Text;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioJwtKeyProvider
{
    private static readonly byte[] Salt = [.. "meowv.com/studio/jwt/v1"u8];
    private static readonly byte[] Info = [.. "signing-key"u8];

    public StudioJwtKeyProvider(StudioJwtOptions jwt, IConfiguration configuration)
    {
        var configured = jwt.SigningKey;
        if (!string.IsNullOrWhiteSpace(configured) && Encoding.UTF8.GetByteCount(configured) >= 32)
        {
            Key = Encoding.UTF8.GetBytes(configured);
            return;
        }

        var bootstrap = configuration["Security:BootstrapToken"];
        if (string.IsNullOrWhiteSpace(bootstrap) || Encoding.UTF8.GetByteCount(bootstrap) < 32)
            throw new InvalidOperationException("缺少至少 32 字符的 Security:BootstrapToken，无法派生 Studio JWT 签名密钥。");

        Key = HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(bootstrap), 32, Salt, Info);
    }

    public byte[] Key { get; }
}
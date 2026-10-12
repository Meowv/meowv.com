using NSec.Cryptography;

namespace XiaomiCamera.Protocol;

/// <summary>CS2 provisioning 所需的临时 X25519 密钥对。</summary>
public sealed class Cs2KeyPair : IDisposable
{
    private static readonly KeyAgreementAlgorithm Algorithm = KeyAgreementAlgorithm.X25519;
    private readonly Key privateKey;

    private Cs2KeyPair(Key privateKey)
    {
        this.privateKey = privateKey;
    }

    public string PublicKeyHex => Convert.ToHexString(privateKey.PublicKey.Export(KeyBlobFormat.RawPublicKey)).ToLowerInvariant();

    public static Cs2KeyPair Create() => new(Key.Create(Algorithm));

    public byte[] Agree(string peerPublicKeyHex)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(peerPublicKeyHex);
        byte[] peerBytes;
        try
        {
            peerBytes = Convert.FromHexString(peerPublicKeyHex);
        }
        catch (FormatException exception)
        {
            throw new Cs2ProtocolException($"CS2 设备公钥不是十六进制编码：{exception.Message}");
        }

        if (peerBytes.Length != Algorithm.PublicKeySize)
        {
            throw new Cs2ProtocolException("CS2 设备公钥长度无效。");
        }

        try
        {
            var peerKey = PublicKey.Import(Algorithm, peerBytes, KeyBlobFormat.RawPublicKey);
            var parameters = new SharedSecretCreationParameters
            {
                ExportPolicy = KeyExportPolicies.AllowPlaintextExport,
            };
            using var sharedSecret = Algorithm.Agree(privateKey, peerKey, parameters)
                                     ?? throw new Cs2ProtocolException("CS2 X25519 密钥协商失败。");
            return sharedSecret.Export(SharedSecretBlobFormat.RawSharedSecret);
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(peerBytes);
        }
    }

    public void Dispose() => privateKey.Dispose();
}
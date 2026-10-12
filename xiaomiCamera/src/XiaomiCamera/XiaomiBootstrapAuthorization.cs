using System.Security.Cryptography;
using System.Text;

namespace XiaomiCamera;

/// <summary>使用部署期密钥保护初始化、账号重绑与授权码轮换。</summary>
public sealed class XiaomiBootstrapAuthorization : IDisposable
{
    private readonly byte[] expectedToken;

    public XiaomiBootstrapAuthorization(XiaomiCameraOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        expectedToken = Encoding.UTF8.GetBytes(options.BootstrapToken);
    }

    public bool IsAuthorized(HttpRequest request)
    {
        var provided = request.Headers["X-Xiaomi-Bootstrap-Token"].ToString();
        if (string.IsNullOrEmpty(provided))
        {
            return false;
        }

        var providedBytes = Encoding.UTF8.GetBytes(provided);
        try
        {
            return providedBytes.Length == expectedToken.Length &&
                   CryptographicOperations.FixedTimeEquals(providedBytes, expectedToken);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(providedBytes);
        }
    }

    public void Dispose() => CryptographicOperations.ZeroMemory(expectedToken);
}
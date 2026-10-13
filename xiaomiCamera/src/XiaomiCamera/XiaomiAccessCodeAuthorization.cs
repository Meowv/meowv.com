namespace XiaomiCamera;

/// <summary>验证调用设备与播放 API 所需的长期 Bearer 授权码。</summary>
public sealed class XiaomiAccessCodeAuthorization(XiaomiCredentialCache credentialCache)
{
    public bool IsAuthorized(HttpRequest request) => IsAuthorized(request, out _);

    public bool IsAuthorized(HttpRequest request, out int version)
    {
        version = 0;
        var authorization = request.Headers.Authorization.ToString();
        const string bearerPrefix = "Bearer ";
        if (!authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var accessCode = authorization[bearerPrefix.Length..].Trim();
        return accessCode.Length > 0 && credentialCache.VerifyAccessCode(accessCode, out version);
    }
}
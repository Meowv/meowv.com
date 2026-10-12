namespace XiaomiCamera.Cloud;

/// <summary>仅在进程内使用的已授权小米云会话；任何调用方均不得记录这些字段。</summary>
public sealed record XiaomiCloudCredentials(string UserId, string CUserId, string Ssecurity, string ServiceToken, string Region)
{
    public byte[] GetSsecurityBytes()
    {
        try
        {
            var value = Convert.FromBase64String(Ssecurity);
            return value.Length == 0 ? throw new InvalidOperationException("XIAOMI_CAMERA_SSECURITY 不能为空。") : value;
        }
        catch (FormatException exception)
        {
            throw new InvalidOperationException("XIAOMI_CAMERA_SSECURITY 必须是 Base64 编码。", exception);
        }
    }

    public Uri GetApiBaseUri()
    {
        var region = Region.Trim().ToLowerInvariant();
        var host = region is "de" or "i2" or "ru" or "sg" or "us"
            ? $"{region}.api.io.mi.com"
            : "api.io.mi.com";
        return new Uri($"https://{host}/app/", UriKind.Absolute);
    }
}
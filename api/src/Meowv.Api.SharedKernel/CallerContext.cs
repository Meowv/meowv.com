namespace Meowv.Api.SharedKernel;

public sealed record CallerContext(string? DeviceId, int AccessCodeVersion, string Ip, string? SessionHash = null, string? UserId = null)
{
    public static CallerContext Empty(string ip = "unknown") => new(null, 0, ip);
}
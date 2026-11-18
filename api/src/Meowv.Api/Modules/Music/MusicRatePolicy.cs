using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Music;

internal sealed class MusicRatePolicy(MusicOptions options) : IRateLimiterPolicy<string>
{
    public Func<OnRejectedContext, CancellationToken, ValueTask> OnRejected => async (rejected, _) =>
    {
        var seconds = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds)) : 60;
        await MusicErrors.Write(rejected.HttpContext, 429, "rate_limited", "音乐请求过于频繁。", seconds);
    };

    public RateLimitPartition<string> GetPartition(HttpContext context) => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Clamp(options.RequestsPerMinute, 1, 1000), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
        });
}
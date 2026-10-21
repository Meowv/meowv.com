using System.Collections.Concurrent;
using System.Security.Cryptography;
using Meowv.Api.Core;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>为单台摄像头签发仅用于 HLS 清单与分片请求的短期不透明票据。</summary>
public sealed class XiaomiPlaybackTicketService : IDisposable
{
    private static readonly TimeSpan IdleLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(1);
    private readonly XiaomiCredentialCache _credentialCache;
    private readonly IAccessCodeService _accessCodes;
    private readonly ConcurrentDictionary<string, PlaybackTicket> _tickets = new(StringComparer.Ordinal);
    private readonly Timer _cleanupTimer;

    public XiaomiPlaybackTicketService(XiaomiCredentialCache credentialCache, IAccessCodeService accessCodes)
    {
        _credentialCache = credentialCache;
        _accessCodes = accessCodes;
        // 无请求的过期票据也要定时回收，避免长期运行时字典随历史播放次数增长。
        _cleanupTimer = new Timer(_ => PruneExpired(), null, CleanupInterval, CleanupInterval);
    }

    public string? Create(XiaomiPlaybackTarget target, int accessCodeVersion)
    {
        if (accessCodeVersion <= 0 || accessCodeVersion != _accessCodes.GetVersion() ||
            target.SessionVersion != _credentialCache.GetSessionVersion())
        {
            return null;
        }

        Prune(accessCodeVersion);
        while (true)
        {
            var ticket = GenerateTicket();
            if (_tickets.TryAdd(ticket, new PlaybackTicket(target, accessCodeVersion)))
            {
                return ticket;
            }
        }
    }

    public bool TryGetPlayback(string ticket, out XiaomiPlaybackTarget target)
    {
        target = default;
        if (string.IsNullOrWhiteSpace(ticket) || !_tickets.TryGetValue(ticket, out var playbackTicket))
        {
            return false;
        }

        var currentVersion = _accessCodes.GetVersion();
        if (currentVersion != playbackTicket.AccessCodeVersion ||
            playbackTicket.Target.SessionVersion != _credentialCache.GetSessionVersion() ||
            !playbackTicket.TryTouch(IdleLifetime))
        {
            _tickets.TryRemove(new KeyValuePair<string, PlaybackTicket>(ticket, playbackTicket));
            return false;
        }

        target = playbackTicket.Target;
        return true;
    }

    private void Prune(int currentVersion)
    {
        foreach (var (ticket, playbackTicket) in _tickets)
        {
            // 轮换前开始的清理不能删除轮换后签发的新票据。
            if (playbackTicket.AccessCodeVersion < currentVersion ||
                playbackTicket.Target.SessionVersion != _credentialCache.GetSessionVersion() ||
                playbackTicket.IsExpired(IdleLifetime))
            {
                _tickets.TryRemove(new KeyValuePair<string, PlaybackTicket>(ticket, playbackTicket));
            }
        }
    }

    private void PruneExpired()
    {
        try
        {
            Prune(_accessCodes.GetVersion());
        }
        catch
        {
            // 定时回收失败不影响正在使用的票据；下一个周期或下一次创建会再次清理。
        }
    }

    public void Dispose() => _cleanupTimer.Dispose();

    private static string GenerateTicket()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        try
        {
            return $"pt_{Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private sealed class PlaybackTicket(XiaomiPlaybackTarget target, int accessCodeVersion)
    {
        private readonly Lock _gate = new();
        private DateTimeOffset _lastAccess = DateTimeOffset.UtcNow;

        public XiaomiPlaybackTarget Target { get; } = target;
        public int AccessCodeVersion { get; } = accessCodeVersion;

        public bool TryTouch(TimeSpan idleLifetime)
        {
            lock (_gate)
            {
                if (DateTimeOffset.UtcNow - _lastAccess > idleLifetime)
                {
                    return false;
                }

                _lastAccess = DateTimeOffset.UtcNow;
                return true;
            }
        }

        public bool IsExpired(TimeSpan idleLifetime)
        {
            lock (_gate)
            {
                return DateTimeOffset.UtcNow - _lastAccess > idleLifetime;
            }
        }
    }
}

public readonly record struct XiaomiPlaybackTarget(string DeviceFingerprint, long SessionVersion, Guid StreamId);
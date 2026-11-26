using System.Collections.Concurrent;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioAttemptLimiter : IStudioAttemptLimiter
{
    private const int MaxEntries = 20_000;
    private static readonly TimeSpan BaseDelay = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan MaxDelay = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    public bool IsBlocked(string key, DateTimeOffset now, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        if (!_entries.TryGetValue(key, out var entry)) return false;

        if (entry.BlockedUntil is { } until && until > now)
        {
            retryAfter = until - now;
            return true;
        }

        if (now - entry.FirstFailureAt > Window && entry.BlockedUntil is null)
            _entries.TryRemove(key, out _);

        return false;
    }

    public void RecordFailure(string key, DateTimeOffset now)
    {
        if (_entries.Count > MaxEntries) EvictExpired(now);

        var entry = _entries.GetOrAdd(key, _ => new Entry { FirstFailureAt = now });
        lock (entry)
        {
            if (now - entry.FirstFailureAt > Window)
            {
                entry.Failures = 0;
                entry.FirstFailureAt = now;
            }

            entry.Failures += 1;
            if (entry.Failures < 3) return;

            var exponent = Math.Min(entry.Failures - 3, 6);
            var delay = TimeSpan.FromSeconds(BaseDelay.TotalSeconds * Math.Pow(2, exponent));
            if (delay > MaxDelay) delay = MaxDelay;
            entry.BlockedUntil = now + delay;
        }
    }

    public void Reset(string key)
    {
        _entries.TryRemove(key, out _);
    }

    private void EvictExpired(DateTimeOffset now)
    {
        foreach (var (key, entry) in _entries)
        {
            var expired = entry.BlockedUntil is { } until ? until < now : now - entry.FirstFailureAt > Window;
            if (expired) _entries.TryRemove(key, out _);
        }
    }

    private sealed class Entry
    {
        public DateTimeOffset? BlockedUntil;
        public int Failures;
        public DateTimeOffset FirstFailureAt;
    }
}
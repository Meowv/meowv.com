namespace Meowv.Api.Modules.Music;

public sealed class MusicRuntime(MusicOptions options, TimeProvider clock)
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Window> _windows = new(StringComparer.Ordinal);
    private int _active;

    private sealed class Window
    {
        public DateTimeOffset Started { get; init; }
        public int Requests { get; set; }
    }

    public bool Available => options is { Enabled: true, BindingFailed: false, RequestsPerMinute: >= 1 and <= 1000, MaxConcurrentRequests: >= 1 and <= 16 };

    public string Status => !options.Enabled ? "disabled" : !Available ? "unavailable" : "ready";

    public bool TryEnter(string partition, out IDisposable? lease, out int retryAfter)
    {
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            if (_windows.Count > 512)
            {
                foreach (var old in _windows.Where(x => now - x.Value.Started >= TimeSpan.FromMinutes(1)).Select(x => x.Key).ToArray())
                    _windows.Remove(old);
            }

            if (!_windows.TryGetValue(partition, out var window) || now - window.Started >= TimeSpan.FromMinutes(1))
            {
                window = new Window { Started = now };
                _windows[partition] = window;
            }

            retryAfter = Math.Max(1, (int)Math.Ceiling((window.Started.AddMinutes(1) - now).TotalSeconds));
            lease = null;
            if (window.Requests >= options.RequestsPerMinute) return false;
            if (_active >= options.MaxConcurrentRequests)
            {
                retryAfter = 1;
                return false;
            }

            window.Requests++;
            _active++;
            lease = new RequestLease(this);
            return true;
        }
    }

    private sealed class RequestLease(MusicRuntime owner) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            lock (owner._gate)
                owner._active--;
        }
    }
}
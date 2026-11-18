namespace Meowv.Api.Modules.Music;

public sealed class MusicRuntime(MusicOptions options, IHostEnvironment environment, TimeProvider clock)
{
    private readonly object _gate = new();
    private DateTimeOffset _window = clock.GetUtcNow();
    private int _requests;
    private int _active;

    public bool Available => options is { Enabled: true, BindingFailed: false } &&
                             (environment.IsDevelopment() || environment.IsEnvironment("Testing")) &&
                             options.RequestsPerMinute is >= 1 and <= 1000 && options.MaxConcurrentRequests is >= 1 and <= 16 &&
                             !string.IsNullOrWhiteSpace(options.RecommendationFallbackQuery) &&
                             options.RecommendationFallbackQuery.Trim().Length is >= 1 and <= 100 &&
                             !options.RecommendationFallbackQuery.Any(char.IsControl);

    public string Status => !options.Enabled ? "disabled" : !Available ? "unavailable" : "ready";

    public bool TryEnter(out IDisposable? lease, out int retryAfter)
    {
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            if (now - _window >= TimeSpan.FromMinutes(1))
            {
                _window = now;
                _requests = 0;
            }

            retryAfter = Math.Max(1, (int)Math.Ceiling((_window.AddMinutes(1) - now).TotalSeconds));
            lease = null;
            if (_requests >= options.RequestsPerMinute) return false;
            if (_active >= options.MaxConcurrentRequests)
            {
                retryAfter = 1;
                return false;
            }

            _requests++;
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
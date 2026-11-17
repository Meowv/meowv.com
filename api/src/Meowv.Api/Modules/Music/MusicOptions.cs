namespace Meowv.Api.Modules.Music;

public sealed class MusicOptions
{
    public bool Enabled { get; set; }
    public bool DeviceCredentialsEnabled { get; set; }
    public bool DemoMode { get; set; }
    public bool NeteaseEnabled { get; set; }
    public string NeteaseRecommendationQuery { get; set; } = "纯音乐";
    public string TestAccessToken { get; set; } = "";
    public int RequestsPerMinute { get; set; } = 60;
    public int MaxConcurrentRequests { get; set; } = 4;
    public string DemoMediaDirectory { get; set; } = "";
    public string DemoMediaBaseUrl { get; set; } = "";
    public string[] DemoAudioUrls { get; set; } = [];
    public string[] AllowedMediaHosts { get; set; } = [];
    internal bool BindingFailed { get; set; }
}

public sealed class MusicRuntime(MusicOptions options, IHostEnvironment environment, TimeProvider clock, MusicDemoMedia media)
{
    private readonly object _gate = new();
    private DateTimeOffset _window = clock.GetUtcNow();
    private int _requests;
    private int _active;

    public bool Available => options.Enabled && !options.BindingFailed && options.DemoMode != options.NeteaseEnabled &&
                             (environment.IsDevelopment() || environment.IsEnvironment("Testing")) &&
                             (options.DeviceCredentialsEnabled || (options.TestAccessToken.Length is >= 32 and <= 1024 && !options.TestAccessToken.Any(char.IsWhiteSpace) && !options.TestAccessToken.Any(char.IsControl))) &&
                             options.RequestsPerMinute is >= 1 and <= 1000 && options.MaxConcurrentRequests is >= 1 and <= 16 &&
                             (options.NeteaseEnabled
                                 ? !string.IsNullOrWhiteSpace(options.NeteaseRecommendationQuery) && options.NeteaseRecommendationQuery.Trim().Length is >= 1 and <= 100 && !options.NeteaseRecommendationQuery.Any(char.IsControl)
                                 : options.DemoAudioUrls.Length <= 2 && options.AllowedMediaHosts.Length <= 16 &&
                                   options.DemoAudioUrls.All(IsAllowedAudio) && (!media.Configured || media.Valid));

    public string Status => !options.Enabled ? "disabled" :
        !Available ? "unavailable" :
        !options.NeteaseEnabled && options.DemoAudioUrls.Length == 0 && !media.Valid ? "degraded" : "ready";

    public bool IsAllowedAudio(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                                                uri is { Scheme: "https", Port: 443, UserInfo.Length: 0, Query.Length: 0, Fragment.Length: 0, HostNameType: UriHostNameType.Dns, IsLoopback: false } && uri.Host.Contains('.') &&
                                                !uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) &&
                                                !uri.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) &&
                                                options.AllowedMediaHosts.Contains(uri.IdnHost, StringComparer.OrdinalIgnoreCase);

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
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
                lock (owner._gate)
                    owner._active--;
        }
    }
}

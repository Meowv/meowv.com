using System.Net;
using System.Text;
using Meowv.Api.Modules.Music;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;

internal static class NeteaseSourceChecks
{
    public static async Task RunAsync()
    {
        var clock = new Clock();
        var handler = new Handler();
        using var http = new HttpClient(handler);
        var source = new NeteaseMusicProvider(http, clock);
        var page = await source.SearchAsync("test", 1, null, default);
        var id = page.Items.Single().Id;
        Check(id.StartsWith("nt-", StringComparison.Ordinal) && page.NextCursor is not null, "Opaque ID and pagination");
        var audio = await source.ResolveAsync(new MusicResolveRequest(id), default);
        Check(audio.Audio.Url.StartsWith("https://", StringComparison.Ordinal) && audio.Audio.DurationMs == 100000 &&
              audio.Audio.ExpiresAt == clock.GetUtcNow().AddMinutes(5).UtcDateTime, "Full MP3, HTTPS and bounded expiry");
        var count = handler.Count;
        await Error(() => source.ResolveAsync(new MusicResolveRequest("unknown"), default), 404);
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id, "other"), default), 403);
        Check(handler.Count == count, "Unknown ID and source mismatch never reach upstream");
        await Error(() => source.SearchAsync("other", 1, page.NextCursor, default), 400);
        foreach (var body in new[]
        {
            Handler.Audio.Replace("\"freeTrialInfo\":null", "\"freeTrialInfo\":{}", StringComparison.Ordinal),
            Handler.Audio.Replace("\"time\":100000", "\"time\":1000", StringComparison.Ordinal),
            Handler.Audio.Replace("m7.music.126.net", "127.0.0.1", StringComparison.Ordinal),
            Handler.Audio.Replace("\"id\":1", "\"id\":2", StringComparison.Ordinal),
            Handler.Audio.Replace("\"type\":\"mp3\"", "\"type\":\"flac\"", StringComparison.Ordinal),
            Handler.Audio.Replace("\"time\":100000", "\"time\":9223372036854775807", StringComparison.Ordinal),
        })
        {
            handler.AudioBody = body;
            await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
        }
        handler.AudioBody = Handler.Audio.Replace("\"time\":100000", "\"time\":0", StringComparison.Ordinal);
        Check((await source.ResolveAsync(new MusicResolveRequest(id), default)).Audio.DurationMs == 100000, "Bounded bitrate and size duration fallback");
        handler.AudioBody = Handler.Audio;
        handler.SearchBody = Handler.Search.Replace("\"fee\":0", "\"fee\":1", StringComparison.Ordinal);
        page = await source.SearchAsync("paid", 1, null, default);
        Check(page.Items.Single().Availability == "unavailable", "Restricted search metadata is explicit");
        count = handler.Count;
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
        Check(handler.Count == count, "Restricted song does not request audio");
        handler.SearchBody = Handler.Search;
        handler.Status = HttpStatusCode.TooManyRequests;
        var rate = await Error(() => source.SearchAsync("rate", 1, null, default), 429);
        Check(rate.RetryAfterSeconds == 10, "Upstream Retry-After preserved");
        count = handler.Count;
        await Error(() => source.SearchAsync("rate", 1, null, default), 429);
        Check(handler.Count == count, "Cooldown prevents new calls");
        clock.Now = clock.Now.AddSeconds(11);
        handler.Status = HttpStatusCode.OK;
        await source.SearchAsync("after", 1, null, default);
        handler.SearchBody = "{\"code\":\"200\"}";
        await Error(() => source.SearchAsync("bad", 1, null, default), 503);
        handler.SearchBody = new string('x', 512 * 1024 + 1);
        await Error(() => source.SearchAsync("large", 1, null, default), 503);
        handler.SearchBody = Handler.Search;
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        try { await source.SearchAsync("cancel", 1, null, cancelled.Token); throw new InvalidOperationException("Expected cancellation"); }
        catch (OperationCanceledException) { }
        var quotaHandler = new Handler();
        using var quotaHttp = new HttpClient(quotaHandler);
        var quota = new NeteaseMusicProvider(quotaHttp, clock);
        for (var i = 0; i < 40; i++) await quota.SearchAsync("bounded", 1, null, default);
        await Error(() => quota.SearchAsync("bounded", 1, null, default), 429);
        Check(quotaHandler.Count == 40, "Provider budget is shared and bounded");
        Console.WriteLine("PASS: Netease source protocol boundary, full-track checks, cancellation and budget");
    }

    private static async Task<MusicException> Error<T>(Func<Task<T>> call, int status)
    {
        try { await call(); throw new InvalidOperationException("Expected source error"); }
        catch (MusicException error) { Check(error.Status == status, "Safe source error status"); return error; }
    }
    private static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.Parse("2026-11-17T00:00:00Z");
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Handler : HttpMessageHandler
    {
        internal const string Search = "{\"code\":200,\"result\":{\"songs\":[{\"id\":1,\"name\":\"Test\",\"artists\":[{\"name\":\"Artist\"}],\"album\":{\"name\":\"Album\"},\"duration\":100000,\"fee\":0}]}}";
        internal const string Audio = "{\"code\":200,\"data\":[{\"id\":1,\"code\":200,\"url\":\"http://m7.music.126.net/test.mp3\",\"type\":\"mp3\",\"time\":100000,\"br\":128000,\"size\":1600000,\"expi\":1200,\"freeTrialInfo\":null}]}";
        internal string SearchBody = Search;
        internal string AudioBody = Audio;
        internal HttpStatusCode Status = HttpStatusCode.OK;
        internal int Count;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Count++;
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "music.163.com", "Fixed upstream HTTPS origin");
            var resolve = request.RequestUri!.AbsolutePath == "/weapi/song/enhance/player/url";
            if (resolve)
            {
                var body = await request.Content!.ReadAsStringAsync(ct);
                Check(body.Contains("params=", StringComparison.Ordinal) && body.Contains("encSecKey=", StringComparison.Ordinal) &&
                      !body.Contains("\"ids\"", StringComparison.Ordinal), "Web request encoding");
            }
            var response = new HttpResponseMessage(Status) { Content = new StringContent(resolve ? AudioBody : SearchBody, Encoding.UTF8, "application/json") };
            if (Status == HttpStatusCode.TooManyRequests) response.Headers.RetryAfter = new(TimeSpan.FromSeconds(10));
            return response;
        }
    }
}

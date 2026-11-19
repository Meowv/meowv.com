using System.Net;
using System.Text;
using Meowv.Api.Modules.Music;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;

internal static class NeteaseSourceChecks
{
    public static async Task RunAsync()
    {
        await CacheChecks();
        await FailureChecks();
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
            clock.Now = clock.Now.AddSeconds(31);
            handler.AudioBody = body;
            var before = handler.Count;
            await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
            Check(handler.Count == before + 1, "Each malformed audio fixture reaches decoding");
        }
        clock.Now = clock.Now.AddSeconds(31);
        handler.AudioBody = Handler.Audio.Replace("\"time\":100000", "\"time\":0", StringComparison.Ordinal);
        Check((await source.ResolveAsync(new MusicResolveRequest(id), default)).Audio.DurationMs == 100000, "Bounded bitrate and size duration fallback");
        handler.AudioBody = Handler.Audio.Replace("\"code\":200,\"url\"", "\"code\":403,\"url\"", StringComparison.Ordinal);
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 403);
        clock.Now = clock.Now.AddSeconds(61);
        handler.AudioBody = Handler.Audio;
        handler.SearchBody = Handler.Search.Replace("\"fee\":0", "\"fee\":1", StringComparison.Ordinal);
        page = await source.SearchAsync("paid", 1, null, default);
        Check(page.Items.Single().Availability == "unavailable", "Restricted search metadata is explicit");
        count = handler.Count;
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
        Check(handler.Count == count, "Restricted song does not request audio");
        foreach (var (body, query) in new[]
        {
            (Handler.Search.Replace("\"fee\":0", "\"fee\":2", StringComparison.Ordinal), "paid2"),
            (Handler.Search.Replace("\"fee\":0", "\"fee\":8", StringComparison.Ordinal), "paid8"),
            (Handler.Search.Replace("\"fee\":0", "\"fee\":0,\"privilege\":{\"st\":1}", StringComparison.Ordinal), "privilege"),
            (Handler.Search.Replace("\"fee\":0", "\"fee\":0,\"noCopyrightRcmd\":{\"reason\":1}", StringComparison.Ordinal), "nocopy")
        })
        {
            handler.SearchBody = body;
            page = await source.SearchAsync(query, 1, null, default);
            Check(page.Items.Single().Availability == "unavailable", "Paid, trial and copyright-restricted metadata is explicit");
        }
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
        clock.Now = clock.Now.AddSeconds(16);
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
        for (var i = 0; i < 40; i++) await quota.SearchAsync("bounded-" + i, 1, null, default);
        await Error(() => quota.SearchAsync("over-budget", 1, null, default), 429);
        Check(quotaHandler.Count == 40, "Provider budget is shared and bounded");
        Console.WriteLine("PASS: Netease source protocol boundary, full-track checks, cancellation and budget");
    }

    private static async Task CacheChecks()
    {
        var clock = new Clock();
        var handler = new Handler();
        using var http = new HttpClient(handler);
        var source = new NeteaseMusicProvider(http, clock);
        var first = await source.SearchAsync("same", 1, null, default);
        var id = first.Items.Single().Id;
        first.Items[0] = first.Items[0] with { Id = "caller-mutated" };
        Check((await source.SearchAsync("same", 1, null, default)).Items.Single().Id == id && handler.Count == 1, "Metadata hit and isolated page array");
        await source.ResolveAsync(new MusicResolveRequest(id), default);
        await source.ResolveAsync(new MusicResolveRequest(id), default);
        Check(handler.Count == 3, "Playable URLs are never cached");
        clock.Now = clock.Now.AddMinutes(5);
        await source.SearchAsync("same", 1, null, default);
        Check(handler.Count == 4, "Metadata expires at boundary");
        handler.SearchBody = "{\"code\":200,\"result\":{\"songs\":[]}}";
        await source.SearchAsync("empty", 1, null, default);
        await source.SearchAsync("empty", 1, null, default);
        Check(handler.Count == 5, "Empty results use short negative cache");
        clock.Now = clock.Now.AddSeconds(30);
        await source.SearchAsync("empty", 1, null, default);
        Check(handler.Count == 6, "Empty result expires without becoming permanent");
        var bounded = new Handler();
        using var boundedHttp = new HttpClient(bounded);
        var boundedSource = new NeteaseMusicProvider(boundedHttp, clock);
        for (var i = 0; i < 33; i++) await boundedSource.SearchAsync("cache-" + i, 1, null, default);
        await boundedSource.SearchAsync("cache-0", 1, null, default);
        Check(bounded.Count == 34, "Metadata cache has finite capacity");
        for (var i = 0; i < 45; i++) await boundedSource.SearchAsync("cache-32", 1, null, default);
        Check(bounded.Count == 34, "Cache hits do not spend upstream quota");
        var indexed = new Handler();
        using var indexedHttp = new HttpClient(indexed);
        var indexedSource = new NeteaseMusicProvider(indexedHttp, clock);
        string? oldestId = null;
        MusicSearchPage? newest = null;
        for (var pageIndex = 0; pageIndex < 21; pageIndex++)
        {
            indexed.SearchBody = "{\"code\":200,\"result\":{\"songs\":[" + string.Join(',', Enumerable.Range(pageIndex * 50 + 1, 50)
                .Select(number => "{\"id\":" + number + ",\"name\":\"Test\",\"artists\":[{\"name\":\"Artist\"}],\"duration\":100000}")) + "]}}";
            newest = await indexedSource.SearchAsync("index-" + pageIndex, 50, null, default);
            oldestId ??= newest.Items[0].Id;
        }
        await Error(() => indexedSource.ResolveAsync(new MusicResolveRequest(oldestId), default), 404);
        indexed.AudioBody = Handler.Audio.Replace("\"id\":1", "\"id\":1001", StringComparison.Ordinal);
        await indexedSource.ResolveAsync(new MusicResolveRequest(newest!.Items[0].Id), default);
        indexed.AudioBody = Handler.Audio.Replace("\"id\":1", "\"id\":1050", StringComparison.Ordinal);
        await indexedSource.ResolveAsync(new MusicResolveRequest(newest.Items[49].Id), default);
        Check(indexed.Count == 23, "Full identity index retains all newest page entries");
        await indexedSource.SearchAsync("index-0", 50, null, default);
        indexed.AudioBody = Handler.Audio;
        await indexedSource.ResolveAsync(new MusicResolveRequest(oldestId), default);
        Check(indexed.Count == 24, "Metadata hit rehydrates evicted identity without another search");
        var delayed = new Handler { Block = new(), Started = new() };
        using var delayedHttp = new HttpClient(delayed);
        var delayedSource = new NeteaseMusicProvider(delayedHttp, clock);
        var pending = delayedSource.SearchAsync("concurrent", 1, null, default);
        await delayed.Started.Task;
        var duplicate = delayedSource.SearchAsync("concurrent", 1, null, default);
        Check(delayed.Count == 1, "Overlapping same-page calls coalesce");
        delayed.Block.SetResult();
        await Task.WhenAll(pending, duplicate);
        Check(delayed.Count == 1, "Only one upstream page was loaded");
        delayed.Block = new(); delayed.Started = new();
        using var cancel = new CancellationTokenSource();
        var canceled = delayedSource.SearchAsync("cancel-flight", 1, null, cancel.Token);
        await delayed.Started.Task;
        cancel.Cancel();
        try { await canceled; throw new InvalidOperationException("Expected active cancellation"); } catch (OperationCanceledException) { }
        delayed.Block.SetResult();
        await delayedSource.SearchAsync("cancel-flight", 1, null, default);
        Check(delayed.Count == 3 && delayedSource.Status == "healthy", "Cancellation reaches upstream, releases loader and does not cache failure");
    }

    private static async Task FailureChecks()
    {
        var clock = new Clock();
        var handler = new Handler();
        using var http = new HttpClient(handler);
        var source = new NeteaseMusicProvider(http, clock);
        await source.SearchAsync("warm", 1, null, default);
        handler.SearchBody = "{\"code\":429,\"retryAfterSeconds\":7}";
        var rate = await Error(() => source.SearchAsync("body-rate", 1, null, default), 429);
        Check(rate.RetryAfterSeconds == 7 && source.Status == "degraded", "HTTP 200 business rate limit");
        var count = handler.Count;
        await Error(() => source.SearchAsync("different", 1, null, default), 429);
        Check(handler.Count == count, "Business rate limit is provider-wide");
        clock.Now = clock.Now.AddSeconds(8);
        foreach (var code in new[] { 301, 401, 403 })
        {
            handler.SearchBody = "{\"code\":" + code + "}";
            await Error(() => source.SearchAsync("denied-" + code, 1, null, default), 403);
            count = handler.Count;
            await Error(() => source.SearchAsync("denied-again", 1, null, default), 403);
            Check(handler.Count == count && source.Status == "offline", "Denied source is not retried");
            clock.Now = clock.Now.AddSeconds(61);
        }
        handler.SearchBody = Handler.Search;
        foreach (var status in new[] { HttpStatusCode.Forbidden, HttpStatusCode.ServiceUnavailable, HttpStatusCode.Found })
        {
            handler.Status = status;
            var expected = status == HttpStatusCode.Forbidden ? 403 : 503;
            var error = await Error(() => source.SearchAsync("http-" + (int)status, 1, null, default), expected);
            count = handler.Count;
            await Error(() => source.SearchAsync("during-backoff", 1, null, default), expected);
            Check(handler.Count == count && error.RetryAfterSeconds > 0, "Transient/denied HTTP backoff suppresses new calls");
            if (status == HttpStatusCode.ServiceUnavailable)
            {
                await source.SearchAsync("warm", 1, null, default);
                Check(handler.Count == count && source.Status == "offline", "Healthy cached metadata remains readable during source outage");
            }
            clock.Now = clock.Now.AddSeconds(61);
        }
        handler.Status = HttpStatusCode.OK;
        foreach (var failure in new Exception[] { new HttpRequestException("private details"), new TaskCanceledException("private details") })
        {
            handler.Failure = failure;
            await Error(() => source.SearchAsync("connection-" + failure.GetType().Name, 1, null, default), failure is TaskCanceledException ? 504 : 503);
            count = handler.Count;
            await Error(() => source.SearchAsync("failure-again", 1, null, default), failure is TaskCanceledException ? 504 : 503);
            Check(handler.Count == count, "Connection and timeout backoff");
            clock.Now = clock.Now.AddSeconds(16);
        }
        handler.Failure = null;
        handler.SearchBody = "{broken";
        await Error(() => source.SearchAsync("malformed", 1, null, default), 503);
        clock.Now = clock.Now.AddSeconds(16);
        handler.SearchBody = Handler.Search;
        await source.SearchAsync("recover", 1, null, default);
        Check(source.Status == "healthy", "Recovery remains explicit after backoff");
        var id = (await source.SearchAsync("recover", 1, null, default)).Items.Single().Id;
        handler.AudioBody = Handler.Audio.Replace("\"freeTrialInfo\":null", "\"freeTrialInfo\":{}", StringComparison.Ordinal);
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
        count = handler.Count;
        await Error(() => source.ResolveAsync(new MusicResolveRequest(id), default), 422);
        Check(handler.Count == count, "Unplayable track has short negative cache");
        clock.Now = clock.Now.AddSeconds(30);
        handler.AudioBody = Handler.Audio;
        await source.ResolveAsync(new MusicResolveRequest(id), default);
        Check(handler.Count == count + 1, "Track failure is not permanent");
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
        internal TaskCompletionSource? Block;
        internal TaskCompletionSource? Started;
        internal Exception? Failure;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Count);
            Started?.TrySetResult();
            if (Block is not null) await Block.Task.WaitAsync(ct);
            if (Failure is not null) throw Failure;
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

using System.Net;
using System.Text;
using Meowv.Api.Modules.Music;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Microsoft.Extensions.Configuration;

internal static class MusicAggregationChecks
{
    public static async Task RunAsync()
    {
        await EarlyReturnChecks();
        var original = Track("nt-one", "Song", "Artist");
        foreach (var title in new[] { "Ｓｏｎｇ", "so\u200Bng", " SONG! " })
            Check(MusicCandidateMatcher.Compare(original, Track("other", title, "ARTIST")).Equivalent, "Unicode, zero-width and case normalization");
        foreach (var title in new[] { "Song (Live)", "Song [Remix]", "Song（伴奏版）", "Song - Cover", "Different Song" })
            Check(!MusicCandidateMatcher.Compare(original, Track("other", title, "Artist")).Equivalent, "Editions and different titles are not equivalent");
        Check(!MusicCandidateMatcher.Compare(original, Track("other", "Song", "Other artist")).Equivalent, "Same title is not same song");
        Check(!MusicCandidateMatcher.Compare(original with { Title = "Song (Live at Tokyo)" }, original with { Title = "Song (Live at Wembley)" }).Equivalent, "Different live performances are not merged");
        Check(!MusicCandidateMatcher.Compare(original with { Title = "Song (Alpha Remix)" }, original with { Title = "Song (Beta Remix)" }).Equivalent, "Different remixes are not merged");
        Check(!MusicCandidateMatcher.Compare(original, Track("other", "Song", "Artist") with { DurationMs = null }).Equivalent, "Unknown duration is not auto matched");
        Check(!MusicCandidateMatcher.Compare(original, Track("other", "Song", "Artist") with { DurationMs = 30000 }).Equivalent, "Preview duration rejected");
        Check(!MusicCandidateMatcher.Compare(original with { Isrc = "USABC1200001" }, original with { Id = "other", Isrc = "USABC1200002" }).Equivalent, "Conflicting ISRC rejected");
        Check(!MusicCandidateMatcher.Compare(original with { Isrc = "USABC1200001" }, Track("other", "Wrong", "Artist") with { Isrc = "USABC1200001" }).Equivalent, "ISRC does not override title");
        Check(MusicCandidateMatcher.Compare(Track("x", "Live and Let Die", "Artist"), Track("y", "Live and Let Die", "Artist")).Edition == "studio", "Ordinary live word is not an edition tag");
        Check(MusicCandidateMatcher.Compare(original with { Title = "Song (uncovered mix)" }, original with { Title = "Song (uncovered mix)" }).Edition == "studio", "Substring cover is not a marker");

        var native = new FullSource([original]);
        var metadata = new Source([Track("kw-one", "Ｓｏｎｇ", "artist", "kuwo-search")]);
        var (catalog, registry, config) = Catalog(native, metadata);
        var result = await catalog.SearchAsync("query", 20, null, default);
        Check(result.Items.Length == 1 && result.Items[0].Id == original.Id && result.Items[0].Title == original.Title && result.Items[0].Sources.Length == 2, "Cross-source match preserves original display and playback identity");
        Check(result.Items[0].Sources[1].Confidence >= .96 && result.Items[0].Availability == "candidate", "Metadata match does not remove native playback");
        Check(registry.Describe().Single(x => x.Id == KuwoSearchProvider.Id).Capabilities.SequenceEqual(["search"]), "Metadata capability is honest");
        var resolved = await catalog.ResolveAsync(new(original.Id), default);
        Check(resolved.ProviderId == NeteaseMusicProvider.Id && native.Resolves == 1, "Only resolver-capable source handles audio");
        await Error(() => catalog.ResolveAsync(new(original.Id, KuwoSearchProvider.Id), default), 403);
        config["Modules:Music:NeteaseEnabled"] = "false";
        var nativeCalls = native.Calls;
        result = await catalog.SearchAsync("query", 20, null, default);
        Check(native.Calls == nativeCalls && result.Items.Single().Availability == "metadata_only" && catalog.EnabledCount == 1 && catalog.Status("ready") == "degraded", "Source switch affects next request and does not invent playback");
        await Error(() => catalog.ResolveAsync(new(original.Id, NeteaseMusicProvider.Id), default), 403);
        await Error(() => catalog.ResolveAsync(new("kw-one"), default), 422);

        native = new FullSource([original]); metadata = new Source([Track("kw-other", "Other", "Other", "kuwo-search")]);
        (catalog, registry, config) = Catalog(native, metadata);
        metadata.Failure = new MusicException("source_unavailable", "private upstream detail", 503, 15);
        result = await catalog.SearchAsync("partial", 20, null, default);
        Check(result.Partial && result.Items.Single().Id == original.Id && result.Warnings.SequenceEqual(["kuwo-search:source_unavailable"]), "Failed metadata source is isolated and sanitized");
        await catalog.ResolveAsync(new(original.Id), default);
        metadata.Failure = null;
        native.Failure = new MusicException("rate_limited", "private upstream detail", 429, 60);
        result = await catalog.SearchAsync("other", 20, null, default);
        Check(result.Partial && result.Items.Single().Availability == "metadata_only", "Metadata search survives playback source failure");
        metadata.Failure = new MusicException("source_unavailable", "private", 503, 15);
        await Error(() => catalog.SearchAsync("all failed", 20, null, default), 429);

        native = new FullSource([Track("nt-1", "N1", "A"), Track("nt-2", "N2", "A"), Track("nt-3", "N3", "A")]);
        metadata = new Source([Track("kw-1", "K1", "B", "kuwo-search"), Track("kw-2", "K2", "B", "kuwo-search"), Track("kw-3", "K3", "B", "kuwo-search")]);
        (catalog, registry, config) = Catalog(native, metadata);
        var ids = new List<string>();
        result = await catalog.SearchAsync("pages", 2, null, default); ids.AddRange(result.Items.Select(x => x.Id));
        var firstCursor = result.NextCursor!;
        result = await catalog.SearchAsync("pages", 2, firstCursor, default); ids.AddRange(result.Items.Select(x => x.Id));
        Check(native.Calls == 1 && metadata.Calls == 1, "Buffered results do not refetch upstream");
        result = await catalog.SearchAsync("pages", 2, result.NextCursor, default); ids.AddRange(result.Items.Select(x => x.Id));
        Check(result.NextCursor is null && ids.Count == 6 && ids.Distinct().Count() == 6, "Bounded multi-source pagination loses no items");
        await Error(() => catalog.SearchAsync("different", 2, firstCursor, default), 400);
        config["Modules:Music:KuwoSearchEnabled"] = "false";
        await Error(() => catalog.SearchAsync("pages", 2, firstCursor, default), 400);

        var handler = new KuwoHandler();
        using var http = new HttpClient(handler);
        var kuwo = new KuwoSearchProvider(http, TimeProvider.System);
        var page = await kuwo.SearchAsync("test", 20, null, default);
        Check(page.Items.Single().Availability == "metadata_only" && page.Items.Single().DurationMs == 200000 && page.Items.Single().Title == "A & B", "Kuwo metadata mapping and capability");
        await kuwo.SearchAsync("test", 20, null, default);
        Check(handler.Count == 1, "Kuwo metadata page cached without another request");
        Console.WriteLine("PASS: source registry, capability isolation, partial failures, pagination and conservative matching");
    }

    private static async Task EarlyReturnChecks()
    {
        var native = new FullSource([Track("nt-fast", "Fast", "Artist")]);
        var metadata = new Source([Track("kw-slow", "Slow", "Other", "kuwo-search")]) { Block = new(), Started = new(), Cancelled = new() };
        var (catalog, _, _) = Catalog(native, metadata);
        var pending = catalog.SearchAsync("early", 20, null, default);
        await metadata.Started.Task.WaitAsync(TimeSpan.FromSeconds(1));
        var result = await pending.WaitAsync(TimeSpan.FromSeconds(2));
        Check(result.Items.Single().Id == "nt-fast" && result.Partial && result.NextCursor is not null &&
            result.Warnings.Contains("kuwo-search:deferred", StringComparer.Ordinal), "Fast source returns before slow source and retains continuation");
        await metadata.Cancelled.Task.WaitAsync(TimeSpan.FromSeconds(1));
        metadata.Block.SetResult();
        result = await catalog.SearchAsync("early", 20, result.NextCursor, default);
        Check(result.Items.Single().Id == "kw-slow" && result.NextCursor is null && native.Calls == 1 && metadata.Calls == 2,
            "Next page resumes deferred source without repeating the fast source");

        native = new FullSource([Track("nt-only", "Only", "Artist")]);
        metadata = new Source([Track("kw-rate", "Rate", "Other", "kuwo-search")]) { Block = new(), Started = new() };
        (catalog, _, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("isolated rate", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        metadata.Failure = new MusicException("rate_limited", "private detail", 429, 60);
        metadata.Block.SetResult();
        result = await catalog.SearchAsync("isolated rate", 20, result.NextCursor, default);
        Check(result.Items.Length == 0 && result.Partial && result.NextCursor is null, "Deferred metadata rate limit does not turn a healthy playback source into a global error");
        await catalog.ResolveAsync(new("nt-only"), default);
        Check(native.Resolves == 1, "Playback source remains usable after metadata continuation failure");

        native = new FullSource([Track("nt-fast", "Fast", "Artist")]);
        metadata = new Source([Track("kw-late", "Late", "Other", "kuwo-search")]) { Block = new(), Started = new(), IgnoreCancellation = true };
        (catalog, _, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("late", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        var cursor = result.NextCursor!;
        Check(result.Items.Single().Id == "nt-fast", "Uncancellable slow result does not delay response");
        metadata.Block.SetResult();
        await Task.Delay(20);
        result = await catalog.SearchAsync("late", 20, cursor, default);
        Check(result.Items.Single().Id == "kw-late" && native.Calls == 1, "Late task cannot consume continuation or duplicate results");

        native = new FullSource([Track("nt-cancel", "Cancel", "Artist")]) { Block = new(), Started = new(), Cancelled = new() };
        metadata = new Source([Track("kw-cancel", "Cancel", "Artist", "kuwo-search")]) { Block = new(), Started = new(), Cancelled = new() };
        (catalog, _, _) = Catalog(native, metadata);
        using var cancellation = new CancellationTokenSource();
        pending = catalog.SearchAsync("cancel all", 20, null, cancellation.Token);
        await Task.WhenAll(native.Started.Task, metadata.Started.Task);
        cancellation.Cancel();
        try { await pending; throw new InvalidOperationException("Expected caller cancellation"); }
        catch (OperationCanceledException) { }
        await Task.WhenAll(native.Cancelled.Task, metadata.Cancelled.Task).WaitAsync(TimeSpan.FromSeconds(1));
        Check(native.Calls == 1 && metadata.Calls == 1, "Caller cancellation reaches every source without retry");

        native = new FullSource([Track("nt-promoted", "Same", "Artist")]) { Block = new(), Started = new(), Cancelled = new() };
        metadata = new Source([Track("kw-first", "Same", "Artist", "kuwo-search")]);
        (catalog, _, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("promote", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        Check(result.Items.Single().Availability == "metadata_only", "Fast metadata can be returned while resolver is slow");
        native.Block.SetResult();
        result = await catalog.SearchAsync("promote", 20, result.NextCursor, default);
        Check(result.Items.Single().Availability == "candidate" && result.Items.Single().Sources.Length == 2,
            "Deferred playable match can upgrade an earlier metadata result");
    }

    private static MusicTrack Track(string id, string title, string artist, string provider = "netease") =>
        new(id, title, [artist], null, 200000, null, null, provider == "netease" ? "candidate" : "metadata_only", [new(provider, id)]);
    private static (MusicCatalog, MusicProviderRegistry, IConfigurationRoot) Catalog(FullSource native, Source metadata)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Modules:Music:NeteaseEnabled"] = "true", ["Modules:Music:KuwoSearchEnabled"] = "true" }).Build();
        var options = new MusicOptions { NeteaseEnabled = true, KuwoSearchEnabled = true };
        var registry = new MusicProviderRegistry(options, config, [native, metadata]);
        return (new MusicCatalog(options, registry, TimeProvider.System), registry, config);
    }
    private static async Task Error<T>(Func<Task<T>> call, int status)
    {
        try { await call(); throw new InvalidOperationException("Expected failure"); }
        catch (MusicException error) { Check(error.Status == status, "Safe aggregate error status"); }
    }
    private static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private class Source(MusicTrack[] tracks) : IMusicSearchProvider
    {
        public virtual string ProviderId => KuwoSearchProvider.Id;
        public string DisplayName => ProviderId;
        public string Version => ProviderId + "-fixture";
        public string Status => Failure is null ? "healthy" : "offline";
        public MusicException? Failure;
        public int Calls;
        public TaskCompletionSource? Block;
        public TaskCompletionSource? Started;
        public TaskCompletionSource? Cancelled;
        public bool IgnoreCancellation;
        public MusicTrack? FindTrack(string id) => tracks.FirstOrDefault(x => x.Id == id);
        public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested(); Calls++;
            Started?.TrySetResult();
            if (Block is not null)
            {
                try { if (IgnoreCancellation) await Block.Task; else await Block.Task.WaitAsync(ct); }
                catch (OperationCanceledException) { Cancelled?.TrySetResult(); throw; }
            }
            if (Failure is not null) throw Failure;
            var count = limit ?? 20;
            var offset = cursor is null ? 0 : int.TryParse(cursor, out var parsed) ? parsed : throw MusicException.Invalid();
            var items = tracks.Skip(offset).Take(count).ToArray();
            return new MusicSearchPage(items, offset + items.Length < tracks.Length ? (offset + items.Length).ToString() : null, false, []);
        }
    }
    private sealed class FullSource(MusicTrack[] tracks) : Source(tracks), IMusicResolverProvider
    {
        public override string ProviderId => NeteaseMusicProvider.Id;
        public int Resolves;
        public Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
        {
            Resolves++;
            return Task.FromResult(new MusicResolvedTrack(request.TrackId!, ProviderId, request.TrackId!, 1,
                new MusicAudio("https://m7.music.126.net/fixture.mp3", "audio/mpeg", 200000, null, true)));
        }
    }
    private sealed class KuwoHandler : HttpMessageHandler
    {
        internal int Count;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Count++;
            Check(request.RequestUri!.Scheme == "https" && request.RequestUri.Host == "www.kuwo.cn" &&
                !request.Headers.Contains("Cookie") && !request.Headers.Contains("Secret") && !request.Headers.Contains("X-Forwarded-For"), "Public metadata request needs no fabricated session or IP");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(
                "{\"TOTAL\":\"1\",\"abslist\":[{\"MUSICRID\":\"MUSIC_12\",\"SONGNAME\":\"A &amp; B\",\"ARTIST\":\"Artist\",\"ALBUM\":\"Album\",\"DURATION\":\"200\"}]}", Encoding.UTF8, "application/json") });
        }
    }
}

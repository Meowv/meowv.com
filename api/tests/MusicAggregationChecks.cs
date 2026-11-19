using System.Net;
using System.Text;
using Meowv.Api.Modules.Music;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;

internal static class MusicAggregationChecks
{
    public static async Task RunAsync()
    {
        await EarlyReturnChecks();
        await ResolveFallbackChecks();
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
        var metadata = new Source([Track("kw-one", "Ｓｏｎｇ", "artist", "qqmusic")]);
        var (catalog, registry) = Catalog(native, metadata);
        var result = await catalog.SearchAsync("query", 20, null, default);
        Check(result.Items.Length == 1 && result.Items[0].Id == original.Id && result.Items[0].Title == original.Title && result.Items[0].Sources.Length == 2, "Cross-source match preserves original display and playback identity");
        Check(result.Items[0].Sources[1].Confidence >= .96 && result.Items[0].Availability == "candidate", "Metadata match does not remove native playback");
        Check(registry.Describe().Single(x => x.Id == QQMusicProvider.Id).Capabilities.SequenceEqual(["search"]), "Metadata capability is honest");
        var resolved = await catalog.ResolveAsync(new(original.Id), default);
        Check(resolved.ProviderId == NeteaseMusicProvider.Id && native.Resolves == 1, "Only resolver-capable source handles audio");
        await Error(() => catalog.ResolveAsync(new(original.Id, QQMusicProvider.Id), default), 403);
        Check(catalog.EnabledCount == 2 && catalog.Status("ready") == "ready", "Both registered providers are enabled by default");

        native = new FullSource([Track("nt-same", "Same", "Artist")]);
        metadata = new Source([Track("nt-same", "Same", "Artist", QQMusicProvider.Id) with { Availability = "unavailable" }]);
        (catalog, registry) = Catalog(native, metadata);
        result = await catalog.SearchAsync("same id", 20, null, default);
        Check(result.Items.Single().Availability == "candidate", "Same-id unavailable metadata never downgrades a playable track");

        native = new FullSource([original]); metadata = new Source([Track("kw-other", "Other", "Other", "qqmusic")]);
        (catalog, registry) = Catalog(native, metadata);
        metadata.Failure = new MusicException("source_unavailable", "private upstream detail", 503, 15);
        result = await catalog.SearchAsync("partial", 20, null, default);
        Check(result.Partial && result.Items.Single().Id == original.Id && result.Warnings.SequenceEqual(["qqmusic:source_unavailable"]), "Failed metadata source is isolated and sanitized");
        await catalog.ResolveAsync(new(original.Id), default);
        metadata.Failure = null;
        native.Failure = new MusicException("rate_limited", "private upstream detail", 429, 60);
        result = await catalog.SearchAsync("other", 20, null, default);
        Check(result.Partial && result.Items.Single().Availability == "metadata_only", "Metadata search survives playback source failure");
        metadata.Failure = new MusicException("source_unavailable", "private", 503, 15);
        await Error(() => catalog.SearchAsync("all failed", 20, null, default), 429);

        native = new FullSource([Track("nt-1", "N1", "A"), Track("nt-2", "N2", "A"), Track("nt-3", "N3", "A")]);
        metadata = new Source([Track("kw-1", "K1", "B", "qqmusic"), Track("kw-2", "K2", "B", "qqmusic"), Track("kw-3", "K3", "B", "qqmusic")]);
        (catalog, registry) = Catalog(native, metadata);
        var ids = new List<string>();
        result = await catalog.SearchAsync("pages", 2, null, default); ids.AddRange(result.Items.Select(x => x.Id));
        var firstCursor = result.NextCursor!;
        result = await catalog.SearchAsync("pages", 2, firstCursor, default); ids.AddRange(result.Items.Select(x => x.Id));
        Check(native.Calls == 1 && metadata.Calls == 1, "Buffered results do not refetch upstream");
        result = await catalog.SearchAsync("pages", 2, result.NextCursor, default); ids.AddRange(result.Items.Select(x => x.Id));
        Check(result.NextCursor is null && ids.Count == 6 && ids.Distinct().Count() == 6, "Bounded multi-source pagination loses no items");
        await Error(() => catalog.SearchAsync("different", 2, firstCursor, default), 400);

        Console.WriteLine("PASS: source registry, capability isolation, partial failures, pagination and conservative matching");
    }

    private static async Task EarlyReturnChecks()
    {
        var native = new FullSource([Track("nt-fast", "Fast", "Artist")]);
        var metadata = new Source([Track("kw-slow", "Slow", "Other", "qqmusic")]) { Block = new(), Started = new(), Cancelled = new() };
        var (catalog, _) = Catalog(native, metadata);
        var pending = catalog.SearchAsync("early", 20, null, default);
        await metadata.Started.Task.WaitAsync(TimeSpan.FromSeconds(1));
        var result = await pending.WaitAsync(TimeSpan.FromSeconds(2));
        Check(result.Items.Single().Id == "nt-fast" && result.Partial && result.NextCursor is not null &&
            result.Warnings.Contains("qqmusic:deferred", StringComparer.Ordinal), "Fast source returns before slow source and retains continuation");
        await metadata.Cancelled.Task.WaitAsync(TimeSpan.FromSeconds(1));
        metadata.Block.SetResult();
        result = await catalog.SearchAsync("early", 20, result.NextCursor, default);
        Check(result.Items.Single().Id == "kw-slow" && result.NextCursor is null && native.Calls == 1 && metadata.Calls == 2,
            "Next page resumes deferred source without repeating the fast source");

        native = new FullSource([Track("nt-only", "Only", "Artist")]);
        metadata = new Source([Track("kw-rate", "Rate", "Other", "qqmusic")]) { Block = new(), Started = new() };
        (catalog, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("isolated rate", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        metadata.Failure = new MusicException("rate_limited", "private detail", 429, 60);
        metadata.Block.SetResult();
        result = await catalog.SearchAsync("isolated rate", 20, result.NextCursor, default);
        Check(result.Items.Length == 0 && result.Partial && result.NextCursor is null &&
              result.Warnings.Contains("qqmusic:rate_limited", StringComparer.Ordinal),
            "Deferred metadata rate limit does not turn a healthy playback source into a global error");
        await catalog.ResolveAsync(new("nt-only"), default);
        Check(native.Resolves == 1, "Playback source remains usable after metadata continuation failure");

        native = new FullSource([Track("nt-fast", "Fast", "Artist")]);
        metadata = new Source([Track("kw-late", "Late", "Other", "qqmusic")]) { Block = new(), Started = new(), IgnoreCancellation = true };
        (catalog, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("late", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        var cursor = result.NextCursor!;
        Check(result.Items.Single().Id == "nt-fast", "Uncancellable slow result does not delay response");
        metadata.Block.SetResult();
        await Task.Delay(20);
        result = await catalog.SearchAsync("late", 20, cursor, default);
        Check(result.Items.Single().Id == "kw-late" && native.Calls == 1, "Late task cannot consume continuation or duplicate results");

        native = new FullSource([Track("nt-cancel", "Cancel", "Artist")]) { Block = new(), Started = new(), Cancelled = new() };
        metadata = new Source([Track("kw-cancel", "Cancel", "Artist", "qqmusic")]) { Block = new(), Started = new(), Cancelled = new() };
        (catalog, _) = Catalog(native, metadata);
        using var cancellation = new CancellationTokenSource();
        pending = catalog.SearchAsync("cancel all", 20, null, cancellation.Token);
        await Task.WhenAll(native.Started.Task, metadata.Started.Task);
        cancellation.Cancel();
        try { await pending; throw new InvalidOperationException("Expected caller cancellation"); }
        catch (OperationCanceledException) { }
        await Task.WhenAll(native.Cancelled.Task, metadata.Cancelled.Task).WaitAsync(TimeSpan.FromSeconds(1));
        Check(native.Calls == 1 && metadata.Calls == 1, "Caller cancellation reaches every source without retry");

        native = new FullSource([Track("nt-promoted", "Same", "Artist")]) { Block = new(), Started = new(), Cancelled = new() };
        metadata = new Source([Track("kw-first", "Same", "Artist", "qqmusic")]);
        (catalog, _) = Catalog(native, metadata);
        result = await catalog.SearchAsync("promote", 20, null, default).WaitAsync(TimeSpan.FromSeconds(2));
        Check(result.Items.Single().Availability == "metadata_only", "Fast metadata can be returned while resolver is slow");
        native.Block.SetResult();
        result = await catalog.SearchAsync("promote", 20, result.NextCursor, default);
        Check(result.Items.Single().Availability == "candidate" && result.Items.Single().Sources.Length == 2,
            "Deferred playable match can upgrade an earlier metadata result");
    }

    private static async Task ResolveFallbackChecks()
    {
        var track = Track("nt-primary", "Song", "Artist");
        var primary = new FullSource([track]);
        var alternateTrack = Track("alt-track", "Song", "Artist", QQMusicProvider.Id) with { Availability = "candidate" };
        var alternate = new FullSource([alternateTrack], QQMusicProvider.Id);
        var (catalog, _) = Catalog(primary, alternate);
        await catalog.SearchAsync("fallback", 20, null, default);
        primary.ResolveFailure = new MusicException("no_playable_match", "fixture", 422);
        var audio = await catalog.ResolveAsync(new(track.Id), default);
        Check(audio.TrackId == track.Id && audio.ProviderId == alternate.ProviderId &&
            audio.SourceTrackId == alternateTrack.Id && primary.Resolves == 1 && alternate.Resolves == 1,
            "A matching enabled resolver uses its own ID and preserves the requested catalog ID");
        await Error(() => catalog.ResolveAsync(new(track.Id, primary.ProviderId), default), 422);
        foreach (var (code, status) in new[] { ("unauthorized", 401), ("forbidden", 403), ("rate_limited", 429), ("source_timeout", 504) })
        {
            primary.ResolveFailure = new MusicException(code, "fixture", status, status >= 429 ? 15 : null);
            await Error(() => catalog.ResolveAsync(new(track.Id), default), status);
        }
        primary.ResolveFailure = new MusicException("no_playable_match", "fixture", 422);
        Check(alternate.Resolves == 1, "Explicit source, permission, and rate limits do not fall back");
        var primaryCalls = primary.Resolves;
        var recovered = await catalog.ResolveAsync(new(track.Id, ExcludedProviderId: primary.ProviderId), default);
        Check(recovered.ProviderId == alternate.ProviderId && recovered.TrackId == track.Id &&
            primary.Resolves == primaryCalls && alternate.Resolves == 2, "Media fallback never resolves the excluded source");
        await Error(() => catalog.ResolveAsync(new(track.Id, primary.ProviderId, ExcludedProviderId: alternate.ProviderId), default), 400);
        await Error(() => catalog.ResolveAsync(new("unknown-track", ExcludedProviderId: primary.ProviderId), default), 422);
        Check(alternate.Resolves == 2, "Media fallback requires a current catalog match");
    }

    private static MusicTrack Track(string id, string title, string artist, string provider = "netease") =>
        new(id, title, [artist], null, 200000, null, null, provider == "netease" ? "candidate" : "metadata_only", [new(provider, id)]);
    private static (MusicCatalog, MusicProviderRegistry) Catalog(FullSource native, Source metadata)
    {
        var options = new MusicOptions { Enabled = true };
        var registry = new MusicProviderRegistry(options, [native, metadata]);
        return (new MusicCatalog(registry, TimeProvider.System), registry);
    }
    private static async Task Error<T>(Func<Task<T>> call, int status)
    {
        try { await call(); throw new InvalidOperationException("Expected failure"); }
        catch (MusicException error) { Check(error.Status == status, "Safe aggregate error status"); }
    }
    private static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private class Source(MusicTrack[] tracks) : IMusicSearchProvider
    {
        public virtual string ProviderId => QQMusicProvider.Id;
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
    private sealed class FullSource(MusicTrack[] tracks, string provider = NeteaseMusicProvider.Id) : Source(tracks), IMusicResolverProvider
    {
        public override string ProviderId => provider;
        public int Resolves;
        public MusicException? ResolveFailure;
        public Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
        {
            Resolves++;
            if (ResolveFailure is not null) throw ResolveFailure;
            return Task.FromResult(new MusicResolvedTrack(request.TrackId!, ProviderId, request.TrackId!, 1,
                new MusicAudio("https://m7.music.126.net/fixture.mp3", "audio/mpeg", 200000, null, true)));
        }
    }
}

using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Meowv.Api.Modules.Music.Storage;
using Microsoft.AspNetCore.WebUtilities;

namespace Meowv.Api.Modules.Music;

public sealed class MusicCatalog(MusicOptions options, MusicProviderRegistry registry, TimeProvider clock)
{
    private readonly Lock _gate = new();
    private readonly Dictionary<string, Continuation> _pages = new(StringComparer.Ordinal);
    private readonly Dictionary<string, KnownTrack> _known = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _aliases = new(StringComparer.Ordinal);
    private long _used;

    private sealed record KnownTrack(MusicTrack Track, Dictionary<string, string> ProviderTrackIds, DateTimeOffset Until, long Used);

    private sealed record Continuation(string Signature, Dictionary<string, string?> Cursors, MusicTrack[] Buffered, HashSet<string> Seen, DateTimeOffset Until, string[] Deferred);

    private sealed record SourcePage(IMusicSearchProvider Source, MusicSearchPage? Page, MusicException? Failure, bool Deferred = false);

    public string Version => registry.Version;
    public int EnabledCount => registry.Enabled.Length;

    public string Status(string configured) => configured == "ready" && !registry.Enabled.Any(x => x is IMusicResolverProvider && x.Status == "healthy") ? "degraded" : configured;

    public MusicProvider[] Providers() => registry.Describe();

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (query is null || query.Trim().Length is < 1 or > 100 || query.Any(char.IsControl)) throw MusicException.Invalid();
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var sources = registry.Enabled.Take(3).ToArray();
        switch (sources.Length)
        {
            case 0:
                throw new MusicException("source_unavailable", "当前没有启用的音乐来源。", 503, 15);
            case 1:
            {
                var single = await Load(sources[0], query, count, cursor, ct);
                if (single.Failure is { } error) throw error;
                return single.Page!;
            }
        }

        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(query.Trim().Normalize(NormalizationForm.FormKC) + "|" + count + "|" + string.Join('|', sources.Select(x => x.ProviderId + ":" + x.Version)))));
        Continuation? previous = null;
        if (cursor is not null)
        {
            lock (_gate)
                if (!_pages.TryGetValue(cursor, out previous) || previous.Signature != signature || previous.Until <= clock.GetUtcNow())
                    throw MusicException.Invalid();
        }

        var cursors = previous is null
            ? sources.ToDictionary(x => x.ProviderId, _ => (string?)null, StringComparer.Ordinal)
            : new Dictionary<string, string?>(previous.Cursors, StringComparer.Ordinal);
        var seen = previous is null ? new HashSet<string>(StringComparer.Ordinal) : new HashSet<string>(previous.Seen, StringComparer.Ordinal);
        var buffered = previous?.Buffered.ToList() ?? [];
        var failures = new List<MusicException>();
        var warnings = new List<string>();
        var deferred = new HashSet<string>(previous?.Deferred ?? [], StringComparer.Ordinal);
        warnings.AddRange(deferred.Select(x => x + ":deferred"));
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(6));
        try
        {
            if (buffered.Count < count)
            {
                var due = sources.Where(x => cursors.ContainsKey(x.ProviderId)).ToArray();
                var postponed = previous?.Deferred ?? [];
                var priority = due.Where(x => postponed.Contains(x.ProviderId, StringComparer.Ordinal)).ToArray();
                var results = new List<SourcePage>();
                if (priority.Length > 0)
                {
                    results.AddRange(await Collect(priority, query, count, cursors, budget.Token, ct, TimeSpan.FromSeconds(2)));
                    Apply(results);
                    var ready = buffered.Select(x => Canonical(x.Id)).Where(x => !seen.Contains(x)).Distinct().Count();
                    if (ready < count)
                    {
                        var others = due.Where(x => !priority.Contains(x)).ToArray();
                        var fallback = await Collect(others, query, count, cursors, budget.Token, ct, null);
                        results.AddRange(fallback);
                        Apply(fallback);
                    }
                }
                else
                {
                    results.AddRange(await Collect(due, query, count, cursors, budget.Token, ct, null));
                    Apply(results);
                }

                ct.ThrowIfCancellationRequested();
                if (buffered.Count == 0 && results.Count > 0 && results.All(x => x.Failure is not null || x.Deferred) &&
                    !sources.Any(source => source.Status == "healthy" && results.All(result => result.Source.ProviderId != source.ProviderId)))
                {
                    if (failures.Count > 0) throw failures.OrderByDescending(x => x.Status == 429).ThenByDescending(x => x.RetryAfterSeconds ?? 0).First();
                    throw new MusicException("source_timeout", "搜索响应超时，请稍后重试。", 504, 15);
                }
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            ct.ThrowIfCancellationRequested();
            if (buffered.Count == 0) throw new MusicException("source_timeout", "搜索响应超时，请稍后重试。", 504, 15);
            warnings.Add("search:source_timeout");
        }

        void Apply(IEnumerable<SourcePage> pages)
        {
            foreach (var result in pages.OrderBy(x => x.Source is IMusicResolverProvider ? 0 : 1))
            {
                if (result.Deferred)
                {
                    deferred.Add(result.Source.ProviderId);
                    if (!warnings.Contains(result.Source.ProviderId + ":deferred", StringComparer.Ordinal)) warnings.Add(result.Source.ProviderId + ":deferred");
                    continue;
                }

                deferred.Remove(result.Source.ProviderId);
                warnings.RemoveAll(x => x == result.Source.ProviderId + ":deferred");
                if (result.Failure is { } error)
                {
                    failures.Add(error);
                    warnings.Add(result.Source.ProviderId + ":" + error.Code);
                    continue;
                }

                var page = result.Page!;
                if (page.NextCursor is { } next && next != cursors[result.Source.ProviderId]) cursors[result.Source.ProviderId] = next;
                else cursors.Remove(result.Source.ProviderId);
                foreach (var item in page.Items) buffered.Add(Merge(item, sources));
            }
        }

        var candidates = buffered.Select(x => Latest(Canonical(x.Id), x)).Where(x => !seen.Contains(x.Id)).GroupBy(x => x.Id, StringComparer.Ordinal)
            .Select(group => Latest(group.Key, group.Last())).ToArray();
        var items = candidates.Take(count).ToArray();
        foreach (var item in items) seen.Add(item.Id);
        buffered = [.. candidates.Skip(count)];
        string? nextCursor = null;
        switch (items.Length)
        {
            case > 0 when seen.Count < 1000 && (cursors.Count > 0 || buffered.Count > 0):
            {
                nextCursor = "mc-" + WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(12));
                lock (_gate)
                {
                    foreach (var old in _pages.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _pages.Remove(old);
                    if (_pages.Count >= 128) _pages.Remove(_pages.MinBy(x => x.Value.Until).Key);
                    _pages[nextCursor] = new Continuation(signature, cursors, buffered.ToArray(), seen, clock.GetUtcNow().AddMinutes(5), deferred.ToArray());
                }

                break;
            }
        }

        return new MusicSearchPage(items, nextCursor, warnings.Count > 0, warnings.ToArray());
    }

    public async Task<MusicRecommendationPage> RecommendAsync(int? limit, string? cursor, CancellationToken ct)
    {
        if (limit is < 1 or > 50) throw MusicException.Invalid();
        var source = registry.Enabled.FirstOrDefault(x => x is IMusicResolverProvider)
                     ?? throw new MusicException("source_unavailable", "当前没有可播放的音乐来源。", 503, 15);
        var result = await Load(source, options.NeteaseRecommendationQuery, limit ?? 20, cursor, ct);
        if (result.Failure is { } error) throw error;
        var page = result.Page!;
        return new MusicRecommendationPage(page.Items.Where(x => x.Availability == "candidate").ToArray(),
            page.NextCursor, source.ProviderId + "_search_candidates", clock.GetUtcNow().UtcDateTime);
    }

    internal async Task<MusicTrack?> MatchChartEntryAsync(MusicChartEntry entry, CancellationToken ct)
    {
        if (entry.DurationMs is not > 0 || entry.Title.Length > 100) return null;
        var reference = new MusicTrack(entry.TrackKey, entry.Title, entry.Artists, null, entry.DurationMs, null,
            entry.Isrc, "candidate", []);
        var query = $"{entry.Title} {entry.Artists[0]}";
        if (query.Length > 100) query = entry.Title;
        foreach (var source in registry.Enabled.Where(x => x is IMusicResolverProvider && x.Status == "healthy"))
        {
            ct.ThrowIfCancellationRequested();
            var page = await Load(source, query, 8, null, ct);
            var matches = page.Page?.Items.Where(x => x.Availability == "candidate" &&
                                                      MusicCandidateMatcher.CanMerge(reference, x)).DistinctBy(x => x.Id).Take(2).ToArray();
            // 同一来源出现多个相同标题、歌手和时长的录音时，不能确定榜单版本。
            if (matches is not [var candidate]) continue;
            try
            {
                var checkedAudio = await ResolveAsync(new MusicResolveRequest(candidate.Id, source.ProviderId), ct);
                if (checkedAudio.Audio.DurationMs is > 0 &&
                    MusicCandidateMatcher.CanMerge(reference, candidate with { DurationMs = checkedAudio.Audio.DurationMs }))
                    return candidate;
            }
            catch (MusicException)
            {
            }
        }

        return null;
    }

    public async Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(request.TrackId) || request.TrackId.Length > 128 || request.Quality != "auto") throw MusicException.Invalid();
        var sources = registry.Enabled;
        var requested = request.PreferredProviderId;
        var excluded = request.ExcludedProviderId;
        if (excluded is not null && (requested is not null || excluded.Length is < 1 or > 64)) throw MusicException.Invalid();
        if (requested is not null && !sources.Any(x => x.ProviderId == requested && x is IMusicResolverProvider))
            throw new MusicException("forbidden", "此来源未启用或不支持完整播放。", 403);
        KnownTrack? known;
        lock (_gate)
        {
            var canonical = Canonical(request.TrackId);
            known = _known.TryGetValue(canonical, out var value) && value.Until > clock.GetUtcNow() ? value : null;
        }

        if (excluded is not null && (known?.ProviderTrackIds.ContainsKey(excluded) != true ||
                                     !sources.Any(x => x.ProviderId == excluded && x is IMusicResolverProvider)))
            throw new MusicException("no_playable_match", "当前歌曲没有其他可用来源。", 422);

        var primary = known?.Track.Sources.FirstOrDefault()?.ProviderId;
        MusicException? firstFailure = null;
        foreach (var source in sources.Where(x => x is IMusicResolverProvider && x.ProviderId != excluded &&
                                                  (requested is null || x.ProviderId == requested))
                     .OrderByDescending(x => x.ProviderId == primary))
        {
            ct.ThrowIfCancellationRequested();
            if (!registry.IsEnabled(source)) continue;
            var id = known is null ? request.TrackId : known.ProviderTrackIds.GetValueOrDefault(source.ProviderId);
            if (id is null) continue;
            if (source.FindTrack(id) is not { Availability: "candidate" } track) continue;
            if (known is not null && (excluded is not null || source.ProviderId != primary) &&
                !MusicCandidateMatcher.CanMerge(known.Track, track)) continue;

            try
            {
                var audio = await ((IMusicResolverProvider)source).ResolveAsync(new MusicResolveRequest(id, source.ProviderId, request.Quality), ct);
                ct.ThrowIfCancellationRequested();
                return audio with { TrackId = request.TrackId };
            }
            catch (MusicException error) when (requested is null && excluded is null && firstFailure is null && source.ProviderId == primary &&
                                               error.Code == "no_playable_match" && error.RetryAfterSeconds is null)
            {
                firstFailure = error;
            }
        }

        if (firstFailure is not null) throw firstFailure;
        if (known is not null || sources.Any(x => x.FindTrack(request.TrackId) is not null))
            throw new MusicException("no_playable_match", "此结果仅提供元数据，暂无完整播放来源。", 422);
        throw new MusicException("track_not_found", "歌曲记录已失效，请重新搜索。", 404);
    }

    private async Task<SourcePage[]> Collect(IMusicSearchProvider[] sources, string query, int count,
        Dictionary<string, string?> cursors, CancellationToken budget, CancellationToken caller, TimeSpan? maximum)
    {
        if (sources.Length == 0) return [];
        using var stage = CancellationTokenSource.CreateLinkedTokenSource(budget);
        if (maximum is { } limit) stage.CancelAfter(limit);
        var pending = sources.ToDictionary(x => Load(x, query, count, cursors[x.ProviderId], stage.Token), x => x);
        var results = new List<SourcePage>();
        Task? grace = null;
        try
        {
            while (pending.Count > 0)
            {
                var choice = grace is null ? await Task.WhenAny(pending.Keys) : await Task.WhenAny(pending.Keys.Cast<Task>().Append(grace));
                caller.ThrowIfCancellationRequested();
                if (choice == grace) break;
                var task = (Task<SourcePage>)choice;
                var provider = pending[task];
                pending.Remove(task);
                SourcePage result;
                try
                {
                    result = await task;
                }
                catch (OperationCanceledException) when (!caller.IsCancellationRequested)
                {
                    results.Add(new SourcePage(provider, null, null, true));
                    break;
                }

                results.Add(result);
                if (grace is null && results.Any(x => x.Page?.Items.Length > 0))
                {
                    var playable = results.Any(x => x.Source is IMusicResolverProvider && x.Page?.Items.Any(t => t.Availability == "candidate") == true);
                    grace = Task.Delay(playable ? 150 : 750, stage.Token);
                }
            }
        }
        finally
        {
            // 完成响应前取消并观察所有慢源，不让未拥有的聚合任务继续改写结果。
            await stage.CancelAsync();
            foreach (var pair in pending)
            {
                if (pair.Key.IsCompletedSuccessfully) results.Add(pair.Key.Result);
                else
                {
                    try
                    {
                        results.Add(await pair.Key);
                    }
                    catch (OperationCanceledException)
                    {
                        results.Add(new SourcePage(pair.Value, null, null, true));
                    }
                }
            }
        }

        caller.ThrowIfCancellationRequested();
        return results.ToArray();
    }

    private string Canonical(string id)
    {
        lock (_gate)
        {
            var current = id;
            for (var i = 0; i < 3; i++)
            {
                var next = _aliases.GetValueOrDefault(current, current);
                if (next == current) break;
                current = next;
            }

            return current;
        }
    }

    private async Task<SourcePage> Load(IMusicSearchProvider source, string query, int count, string? cursor, CancellationToken ct)
    {
        if (!registry.IsEnabled(source)) return new(source, null, new MusicException("forbidden", "来源已关闭。", 403));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(6));
        try
        {
            var page = await source.SearchAsync(query, count, cursor, timeout.Token).WaitAsync(timeout.Token);
            ct.ThrowIfCancellationRequested();
            return page.Items.Length > count ? throw new MusicException("source_unavailable", "来源返回无效结果。", 503, 15) : new SourcePage(source, page, null);
        }
        catch (MusicException error)
        {
            return new SourcePage(source, null, error);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return new SourcePage(source, null, new MusicException("source_timeout", "来源响应超时。", 504, 15));
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            return new SourcePage(source, null, new MusicException("source_unavailable", "来源暂时不可用。", 503, 15));
        }
    }

    private MusicTrack Merge(MusicTrack incoming, IMusicSearchProvider[] enabled)
    {
        lock (_gate)
        {
            foreach (var old in _known.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _known.Remove(old);
            var previous = _known.Values.FirstOrDefault(x => x.Track.Id == incoming.Id || !x.Track.Sources.Any(a => incoming.Sources.Any(b => a.ProviderId == b.ProviderId)) && MusicCandidateMatcher.CanMerge(x.Track, incoming));
            var existing = previous?.Track;
            var baseline = existing is null || existing.Id == incoming.Id || incoming.Availability == "candidate" && existing.Availability != "candidate" ? incoming : existing;
            var matches = (existing?.Sources ?? []).Concat(incoming.Sources).Where(x => enabled.Any(p => p.ProviderId == x.ProviderId))
                .DistinctBy(x => (x.ProviderId, x.SourceTrackId)).OrderBy(x => x.ProviderId == baseline.Sources[0].ProviderId ? 0 : 1).Select(x => x.ProviderId == baseline.Sources[0].ProviderId
                    ? x
                    : x with
                    {
                        Confidence = Math.Min(.99, existing is null ? 1 : MusicCandidateMatcher.Compare(existing, incoming).Confidence),
                        Edition = MusicCandidateMatcher.Compare(baseline, incoming).Edition
                    }).ToArray();
            var result = baseline with { Sources = matches };
            if (existing is not null && existing.Id != result.Id) _known.Remove(existing.Id);
            if (_known.Count >= 1000 && !_known.ContainsKey(result.Id)) _known.Remove(_known.MinBy(x => x.Value.Used).Key);
            var providerTrackIds = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var source in matches)
            {
                var id = source.ProviderId == incoming.Sources[0].ProviderId ? incoming.Id : previous?.ProviderTrackIds.GetValueOrDefault(source.ProviderId);
                if (id is not null) providerTrackIds[source.ProviderId] = id;
            }

            _known[result.Id] = new KnownTrack(result, providerTrackIds, clock.GetUtcNow().AddHours(24), ++_used);
            foreach (var id in new[] { incoming.Id, existing?.Id }.OfType<string>())
            {
                if (_aliases.Count >= 2000 && !_aliases.ContainsKey(id)) _aliases.Remove(_aliases.Keys.First());
                _aliases[id] = result.Id;
            }

            return result;
        }
    }

    private MusicTrack Latest(string id, MusicTrack fallback)
    {
        lock (_gate) return _known.TryGetValue(id, out var value) ? value.Track : fallback;
    }
}
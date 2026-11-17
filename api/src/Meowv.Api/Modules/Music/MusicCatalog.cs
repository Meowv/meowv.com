using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Microsoft.AspNetCore.WebUtilities;

namespace Meowv.Api.Modules.Music;

public sealed class MusicCatalog(MusicOptions options, MusicProviderRegistry registry, TimeProvider clock)
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Continuation> _pages = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (MusicTrack Track, DateTimeOffset Until, long Used)> _known = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _aliases = new(StringComparer.Ordinal);
    private long _used;
    private sealed record Continuation(string Signature, Dictionary<string, string?> Cursors, MusicTrack[] Buffered,
        HashSet<string> Seen, DateTimeOffset Until);
    private sealed record SourcePage(IMusicSearchProvider Source, MusicSearchPage? Page, MusicException? Failure);

    public string Version => registry.Version;
    public int EnabledCount => registry.Enabled.Length;
    public string Status(string configured) => configured == "ready" &&
        !registry.Enabled.Any(x => x is IMusicResolverProvider && x.Status == "healthy") ? "degraded" : configured;
    public MusicProvider[] Providers() => registry.Describe();

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (query is null || query.Trim().Length is < 1 or > 100 || query.Any(char.IsControl)) throw MusicException.Invalid();
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var sources = registry.Enabled.Take(3).ToArray();
        if (sources.Length == 0) throw new MusicException("source_unavailable", "当前没有启用的音乐来源。", 503, 15);
        if (sources.Length == 1)
        {
            var single = await Load(sources[0], query, count, cursor, ct);
            if (single.Failure is { } error) throw error;
            return single.Page!;
        }
        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            query.Trim().Normalize(NormalizationForm.FormKC) + "|" + count + "|" +
            string.Join('|', sources.Select(x => x.ProviderId + ":" + x.Version)))));
        Continuation? previous = null;
        if (cursor is not null)
        {
            lock (_gate)
                if (!_pages.TryGetValue(cursor, out previous) || previous.Signature != signature || previous.Until <= clock.GetUtcNow())
                    throw MusicException.Invalid();
        }
        var cursors = previous is null ? sources.ToDictionary(x => x.ProviderId, _ => (string?)null, StringComparer.Ordinal)
            : new Dictionary<string, string?>(previous.Cursors, StringComparer.Ordinal);
        var seen = previous is null ? new HashSet<string>(StringComparer.Ordinal) : new HashSet<string>(previous.Seen, StringComparer.Ordinal);
        var buffered = previous?.Buffered.ToList() ?? [];
        var failures = new List<MusicException>();
        var warnings = new List<string>();
        if (buffered.Count < count)
        {
            var jobs = sources.Where(x => cursors.ContainsKey(x.ProviderId))
                .Select(x => Load(x, query, count, cursors[x.ProviderId], ct));
            var results = await Task.WhenAll(jobs);
            ct.ThrowIfCancellationRequested();
            foreach (var result in results.OrderBy(x => x.Source is IMusicResolverProvider ? 0 : 1))
            {
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
            if (failures.Count == results.Length && buffered.Count == 0)
                throw failures.OrderByDescending(x => x.Status == 429).ThenByDescending(x => x.RetryAfterSeconds ?? 0).First();
        }
        var candidates = buffered.Where(x => !seen.Contains(x.Id)).GroupBy(x => x.Id, StringComparer.Ordinal)
            .Select(group => Latest(group.Key, group.Last())).ToArray();
        var items = candidates.Take(count).ToArray();
        foreach (var item in items) seen.Add(item.Id);
        buffered = candidates.Skip(count).ToList();
        string? nextCursor = null;
        if (items.Length > 0 && seen.Count < 1000 && (cursors.Count > 0 || buffered.Count > 0))
        {
            nextCursor = "mc-" + WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(12));
            lock (_gate)
            {
                foreach (var old in _pages.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _pages.Remove(old);
                if (_pages.Count >= 128) _pages.Remove(_pages.MinBy(x => x.Value.Until).Key);
                _pages[nextCursor] = new Continuation(signature, cursors, buffered.ToArray(), seen, clock.GetUtcNow().AddMinutes(5));
            }
        }
        return new MusicSearchPage(items, nextCursor, warnings.Count > 0, warnings.ToArray());
    }

    public async Task<MusicRecommendationPage> RecommendAsync(int? limit, string? cursor, CancellationToken ct)
    {
        if (limit is < 1 or > 50) throw MusicException.Invalid();
        // 推荐只从具备完整播放能力的源取候选，元数据源不占用播放队列预算。
        var source = registry.Enabled.FirstOrDefault(x => x is IMusicResolverProvider)
            ?? throw new MusicException("source_unavailable", "当前没有可播放的音乐来源。", 503, 15);
        var result = await Load(source, options.NeteaseRecommendationQuery, limit ?? 20, cursor, ct);
        if (result.Failure is { } error) throw error;
        var page = result.Page!;
        return new MusicRecommendationPage(page.Items.Where(x => x.Availability == "candidate").ToArray(),
            page.NextCursor, source.ProviderId + "_search_candidates", clock.GetUtcNow().UtcDateTime);
    }

    public async Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(request.TrackId) || request.TrackId.Length > 128 || request.Quality != "auto") throw MusicException.Invalid();
        var sources = registry.Enabled;
        var requested = request.PreferredProviderId;
        if (requested is not null && !sources.Any(x => x.ProviderId == requested && x is IMusicResolverProvider))
            throw new MusicException("forbidden", "此来源未启用或不支持完整播放。", 403);
        MusicTrack? known;
        lock (_gate)
        {
            var canonical = _aliases.GetValueOrDefault(request.TrackId, request.TrackId);
            known = _known.TryGetValue(canonical, out var value) && value.Until > clock.GetUtcNow() ? value.Track : null;
        }
        foreach (var source in sources.Where(x => x is IMusicResolverProvider && (requested is null || x.ProviderId == requested)))
        {
            var id = known?.Sources.Any(x => x.ProviderId == source.ProviderId) == true ? known.Id : request.TrackId;
            if (source.FindTrack(id) is null) continue;
            var audio = await ((IMusicResolverProvider)source).ResolveAsync(new MusicResolveRequest(id, source.ProviderId, request.Quality), ct);
            return audio with { TrackId = request.TrackId };
        }
        if (known is not null || sources.Any(x => x.FindTrack(request.TrackId) is not null))
            throw new MusicException("no_playable_match", "此结果仅提供元数据，暂无完整播放来源。", 422);
        throw new MusicException("track_not_found", "歌曲记录已失效，请重新搜索。", 404);
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
            if (page.Items.Length > count) throw new MusicException("source_unavailable", "来源返回无效结果。", 503, 15);
            return new(source, page, null);
        }
        catch (MusicException error) { return new(source, null, error); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return new(source, null, new MusicException("source_timeout", "来源响应超时。", 504, 15)); }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { return new(source, null, new MusicException("source_unavailable", "来源暂时不可用。", 503, 15)); }
    }

    private MusicTrack Merge(MusicTrack incoming, IMusicSearchProvider[] enabled)
    {
        lock (_gate)
        {
            foreach (var old in _known.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _known.Remove(old);
            var existing = _known.Values.Select(x => x.Track).FirstOrDefault(x => x.Id == incoming.Id || !x.Sources.Any(a => incoming.Sources.Any(b => a.ProviderId == b.ProviderId)) && MusicCandidateMatcher.CanMerge(x, incoming));
            var baseline = existing is null || existing.Id == incoming.Id || incoming.Availability == "candidate" && existing.Availability != "candidate" ? incoming : existing;
            var matches = (existing?.Sources ?? []).Concat(incoming.Sources).Where(x => enabled.Any(p => p.ProviderId == x.ProviderId))
                .DistinctBy(x => (x.ProviderId, x.SourceTrackId)).OrderBy(x => x.ProviderId == baseline.Sources[0].ProviderId ? 0 : 1).Select(x => x.ProviderId == baseline.Sources[0].ProviderId ? x :
                    x with { Confidence = Math.Min(.99, existing is null ? 1 : MusicCandidateMatcher.Compare(existing, incoming).Confidence),
                        Edition = MusicCandidateMatcher.Compare(baseline, incoming).Edition }).ToArray();
            var result = baseline with { Sources = matches };
            if (existing is not null && existing.Id != result.Id) _known.Remove(existing.Id);
            if (_known.Count >= 1000 && !_known.ContainsKey(result.Id)) _known.Remove(_known.MinBy(x => x.Value.Used).Key);
            _known[result.Id] = (result, clock.GetUtcNow().AddHours(24), ++_used);
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

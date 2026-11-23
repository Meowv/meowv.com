using System.Security.Cryptography;
using System.Text.Json;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Meowv.Api.Modules.Music.QQ;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed class MusicCandidatePool(MusicOptions options, MusicRuntime runtime, MusicCandidateStore store, MusicDailyFeeds feeds, MusicCatalog catalog, MusicProviderRegistry registry, QQMusicProvider qq, NeteaseMusicProvider netease, QQMusicSkill skill, TimeProvider clock, ILogger<MusicCandidatePool> logger) : BackgroundService
{
    private static readonly TimeSpan Retention = TimeSpan.FromDays(7);
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromMinutes(30);
    private readonly Lock _gate = new();
    private readonly Dictionary<string, PagePosition> _positions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Batch> _batches = new(StringComparer.Ordinal);
    private long _lastDemand;
    private DateTimeOffset _nextRefresh;

    private sealed record Batch(string Device, MusicCandidate[] Items, QQMembership.Access? Member, DateTimeOffset Created);

    private sealed record PagePosition(Batch Batch, int Offset, int Limit);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10), clock);
        while (await timer.WaitForNextTickAsync(ct))
        {
            var now = clock.GetUtcNow();
            var demand = Interlocked.Read(ref _lastDemand);
            if (!options.RollingRecommendationsEnabled || !runtime.Available || demand == 0 ||
                now - DateTimeOffset.FromUnixTimeSeconds(demand) >= TimeSpan.FromHours(1) || now < _nextRefresh) continue;
            _nextRefresh = now + RefreshInterval;
            try
            {
                await RefreshAsync(now, ct);
            }
            catch (Exception error) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning("滚动音乐候选刷新失败，错误类型 {ErrorType}。", error.GetType().Name);
            }
        }
    }

    internal async Task RefreshAsync(DateTimeOffset now, CancellationToken ct)
    {
        var previous = store.Read();
        if (now - previous.Refreshed < RefreshInterval) return;
        var items = previous.Items.Where(item => item.Seen > now - Retention).ToList();
        try
        {
            var daily = await feeds.GetDailyAsync(false, ct);
            foreach (var item in daily.Items)
            {
                // 沿用榜单快照的实际抓取时间，陈旧快照不会延长候选寿命。
                var seen = daily.Sources.Where(source => item.Track.Sources.Any(match => match.ProviderId == source.Source)).Select(source => source.CapturedAt).DefaultIfEmpty(now).Max();
                if (seen > now - Retention) Merge(items, Capture(item.Track), seen, false);
            }
        }
        catch (MusicException)
        {
        }

        var positions = new Dictionary<string, string>(previous.Positions, StringComparer.Ordinal);
        var query = MusicCatalog.FallbackQuery(DateTimeOffset.UnixEpoch.AddHours(previous.Turn));
        foreach (var provider in registry.Enabled.Where(provider => provider is QQMusicProvider or NeteaseMusicProvider))
        {
            var key = provider.ProviderId + "|" + query;
            try
            {
                var page = await provider.SearchAsync(query, 20, positions.GetValueOrDefault(key), ct);
                foreach (var track in page.Items) Merge(items, Capture(track), now, true);
                if (page.NextCursor is { } cursor && cursor != positions.GetValueOrDefault(key)) positions[key] = cursor;
                else positions.Remove(key);
            }
            catch (MusicException error) when (error.Status == 400)
            {
                positions.Remove(key);
            }
            catch (MusicException)
            {
            }
        }

        ct.ThrowIfCancellationRequested();
        store.Write(new MusicCandidateState(Interleave(items).Take(150).ToArray(), positions, (previous.Turn + 1) % 8, now));
    }

    public async Task<MusicRecommendationPage> ReadAsync(string device, int? limit, string? cursor, QQMembership.Access? access, CancellationToken ct)
    {
        var count = limit ?? 30;
        if (count is < 1 or > 30 || cursor is { Length: > 64 }) throw MusicException.Invalid();
        if (!options.RollingRecommendationsEnabled)
            throw new MusicException("candidates_disabled", "滚动推荐尚未启用。", 404);
        var now = clock.GetUtcNow();
        Interlocked.Exchange(ref _lastDemand, now.ToUnixTimeSeconds());

        PagePosition position;
        if (cursor is null)
        {
            MusicCandidate[] publicItems;
            try
            {
                publicItems = store.Read().Items.Where(x => x.Seen > now - Retention).ToArray();
            }
            catch (Exception error) when (Recoverable(error))
            {
                return new MusicRecommendationPage([], null, "rolling_warming", now.UtcDateTime, true);
            }

            if (publicItems.Length == 0) return new MusicRecommendationPage([], null, "rolling_warming", now.UtcDateTime, true);
            var batch = await CreateBatchAsync(device, publicItems, access, now, ct);
            position = new PagePosition(batch, 0, count);
        }
        else
        {
            lock (_gate)
            {
                if (!_positions.TryGetValue(cursor, out var found) || found.Batch.Device != device || found.Limit != count || found.Batch.Created.AddMinutes(30) <= now)
                    throw new MusicException("candidate_cursor_expired", "推荐候选已刷新，请重新开始。");
                position = found;
            }
        }

        var member = position.Batch.Member?.Current == true && access?.Current == true;
        var selected = position.Batch.Items.Skip(position.Offset).Take(count).Where(x => !x.Private || member).ToArray();
        var tracks = Rebuild(selected);
        var playable = (await catalog.ProjectAvailabilityAsync(tracks, access, ct)).Where(track => track.Availability == "candidate").ToArray();
        var memberStillCurrent = position.Batch.Member?.Current == true;
        if (member && !memberStillCurrent || access is not null && !access.Current)
        {
            selected = selected.Where(x => !x.Private).ToArray();
            tracks = Rebuild(selected);
            playable = catalog.PlayableCandidates(tracks);
        }

        var discovery = playable.Where(track => selected.Any(row => row.Discovery && Same(track, row))).Select(track => track.Id).ToArray();
        var offset = position.Offset + count;
        string? next = null;
        if (offset < position.Batch.Items.Length)
        {
            lock (_gate)
            {
                foreach (var old in _positions.Where(x => x.Value.Batch.Created.AddMinutes(30) <= now).Select(x => x.Key).ToArray())
                    _positions.Remove(old);
                next = _positions.FirstOrDefault(x => ReferenceEquals(x.Value.Batch, position.Batch) && x.Value.Offset == offset && x.Value.Limit == count).Key;
                if (next is null)
                {
                    if (_positions.Count >= 512) _positions.Remove(_positions.MinBy(x => x.Value.Batch.Created).Key);
                    next = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(18));
                    _positions[next] = position with { Offset = offset };
                }
            }
        }

        return new MusicRecommendationPage(playable, next, "rolling_candidates", position.Batch.Created.UtcDateTime, DiscoveryTrackIds: discovery);
    }

    private async Task<Batch> CreateBatchAsync(string device, MusicCandidate[] publicItems, QQMembership.Access? access, DateTimeOffset now, CancellationToken ct)
    {
        // 同一设备短时间内重用候选集合，播放权益仍在每页返回前重新投影。
        lock (_gate)
            if (_batches.TryGetValue(device, out var previous) && previous.Created.AddMinutes(2) > now && (access is null ? previous.Member is null : previous.Member?.Current == true))
                return previous;

        var batch = new Batch(device, publicItems, access, now);
        if (access?.Current == true && registry.IsEnabled(qq))
        {
            var daily = Array.Empty<MusicTrack>();
            var radio = Array.Empty<MusicTrack>();
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
            budget.CancelAfter(TimeSpan.FromSeconds(2));
            try
            {
                daily = await skill.PersonalizeAsync(Rebuild(publicItems), qq, catalog, budget.Token, includeMember: true, personalOnly: true);
                radio = await skill.RadioAsync(qq, budget.Token, includeMember: true);
            }
            catch (MusicException)
            {
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
            }

            if (access.Current)
            {
                var privateItems = new List<MusicCandidate>();
                foreach (var track in daily.Take(12)) Merge(privateItems, Capture(track), now, false, personal: true);
                foreach (var track in radio.Take(12)) Merge(privateItems, Capture(track), now, true, personal: true);
                var ordered = Interleave(privateItems.Where(item => !publicItems.Any(other => item.Sources.Any(source => Same(source.Track, other)))).Concat(publicItems));
                batch = batch with { Items = ordered.ToArray() };
            }
        }

        lock (_gate)
        {
            if (_batches.Count >= 64 && !_batches.ContainsKey(device)) _batches.Remove(_batches.MinBy(x => x.Value.Created).Key);
            _batches[device] = batch;
        }

        return batch;
    }

    public void Restore(string id)
    {
        if (!options.RollingRecommendationsEnabled) return;
        try
        {
            var now = clock.GetUtcNow();
            var row = store.Read().Items.FirstOrDefault(item => item.Seen > now - Retention && item.Sources.Any(source => source.Track.Id == id));
            if (row is not null) Rebuild([row]);
        }
        catch (Exception error) when (Recoverable(error))
        {
        }
    }

    private MusicCandidateSource[] Capture(MusicTrack track)
    {
        var result = new List<MusicCandidateSource>();
        foreach (var match in track.Sources)
        {
            switch (match.ProviderId)
            {
                case QQMusicProvider.Id when qq.Candidate(match.SourceTrackId) is { } qqEntry && (qqEntry.Track.Availability == "candidate" || qqEntry is { RequiresMembership: true, MediaId: not null }):
                    result.Add(new MusicCandidateSource(qqEntry.Track, qqEntry.MediaId, qqEntry.Size, qqEntry.RequiresMembership));
                    break;
                case NeteaseMusicProvider.Id when netease.Candidate(match.SourceTrackId) is { Availability: "candidate" } nt:
                    result.Add(new MusicCandidateSource(nt));
                    break;
            }
        }

        return [.. result];
    }

    private MusicTrack[] Rebuild(IEnumerable<MusicCandidate> candidates)
    {
        var sources = candidates.SelectMany(item => item.Sources).ToArray();
        if (registry.IsEnabled(netease))
            netease.RememberDaily(sources.Where(x => x.Track.Sources[0].ProviderId == NeteaseMusicProvider.Id && netease.FindTrack(x.Track.Id) is null).Select(x => x.Track));
        if (registry.IsEnabled(qq))
            qq.Remember(sources.Where(x => x.Track.Sources[0].ProviderId == QQMusicProvider.Id && qq.FindTrack(x.Track.Id) is null).Select(x => new QQMusicProvider.Entry(x.Track, x.MediaId, x.MediaSize, default, RequiresMembership: x.RequiresMembership)));
        var enabled = registry.Enabled.Select(provider => provider.ProviderId).ToHashSet(StringComparer.Ordinal);
        return catalog.MergeDaily(sources.Where(x => enabled.Contains(x.Track.Sources[0].ProviderId)).Select(x => x.Track));
    }

    internal static void Merge(List<MusicCandidate> items, MusicCandidateSource[] sources, DateTimeOffset now, bool discovery, bool personal = false)
    {
        if (sources.Length == 0) return;
        var index = items.FindIndex(item => sources.Any(source => Same(source.Track, item)));
        if (index < 0)
        {
            items.Add(new MusicCandidate(sources, now, now, discovery, personal));
            return;
        }

        var previous = items[index];
        var merged = sources.Concat(previous.Sources).DistinctBy(x => x.Track.Sources[0].ProviderId).ToArray();
        items[index] = previous with { Sources = merged, Seen = now > previous.Seen ? now : previous.Seen, Discovery = previous.Discovery && discovery };
    }

    private static bool Same(MusicTrack track, MusicCandidate item) => item.Sources.Any(source => track.Sources.Any(a => source.Track.Sources.Any(b => a.ProviderId == b.ProviderId && a.SourceTrackId == b.SourceTrackId)) || MusicCandidateMatcher.CanMerge(track, source.Track));

    private static IEnumerable<MusicCandidate> Interleave(IEnumerable<MusicCandidate> items)
    {
        var sorted = items.OrderByDescending(x => x.Private).ThenByDescending(x => x.Added).ToArray();
        var regular = new Queue<MusicCandidate>(sorted.Where(x => !x.Discovery));
        var discovery = new Queue<MusicCandidate>(sorted.Where(x => x.Discovery));
        for (var index = 0; regular.Count > 0 || discovery.Count > 0; index++)
        {
            var wanted = index % 5 < 3 ? regular : discovery;
            if (!wanted.TryDequeue(out var item)) (wanted == regular ? discovery : regular).TryDequeue(out item);
            yield return item!;
        }
    }

    private static bool Recoverable(Exception error) => error is SqliteException or ApiDatabaseSchemaException or JsonException or IOException or MusicException;
}
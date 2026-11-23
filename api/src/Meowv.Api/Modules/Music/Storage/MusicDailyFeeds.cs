using System.Collections.Concurrent;
using System.Text.Json;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Meowv.Api.Modules.Music.QQ;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed class MusicDailyFeeds(MusicChartStore store, MusicProviderRegistry registry, MusicCatalog catalog, NeteaseMusicProvider netease, QQMusicProvider qq, TimeProvider clock, QQMusicSkill skill, MusicOptions options)
{
    private static readonly TimeZoneInfo BusinessZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");

    private readonly FeedSpec[] _feeds = FeedSpec.Defaults;

    private readonly Dictionary<(string Feed, string Provider), FeedSpec> _specs = FeedSpec.Defaults.GroupBy(x => (x.Id, x.ProviderId)).ToDictionary(x => x.Key, x => x.First());

    private readonly ConcurrentDictionary<(string Feed, string Provider), RefreshState> _states = new();

    private sealed class RefreshState
    {
        public readonly SemaphoreSlim Gate = new(1);
        public DateTimeOffset RetryAt;
        public bool Failed;
    }

    private sealed record SourceResult(string Provider, MusicChartSnapshot? Snapshot, bool Stale);

    public async Task<MusicDailyPage> GetDailyAsync(bool force, CancellationToken ct, QQMembership.Access? access = null)
    {
        var page = await GetAsync(_feeds, "daily", force, ct);
        if (access is null) return page;
        var tracks = await catalog.ProjectAvailabilityAsync(page.Items.Select(item => item.Track), access, ct);
        return page with { Items = page.Items.Select((item, index) => item with { Track = tracks[index] }).ToArray() };
    }

    private async Task<MusicDailyPage> GetAsync(FeedSpec[] feeds, string name, bool force, CancellationToken ct)
    {
        var providers = registry.Enabled.Where(x => x is NeteaseMusicProvider or QQMusicProvider).Select(x => x.ProviderId).ToArray();
        var tasks = feeds.SelectMany(feed => providers.Where(p => p == feed.ProviderId && _specs.ContainsKey((feed.Id, p))).Select(p => ReadAsync(feed, p, force, ct))).ToArray();
        var results = await Task.WhenAll(tasks);
        var available = results.Where(x => x.Snapshot is not null).ToArray();
        if (available.Length == 0) throw Unavailable();

        var ordered = available.SelectMany(source => source.Snapshot!.Entries.Select(entry => (source.Provider, Entry: entry))).OrderBy(x => x.Entry.Rank).ToArray();
        var summaries = available.Select(x => new MusicDailySource(x.Provider, x.Snapshot!.CapturedAt, x.Snapshot.SourceUpdatedAt, x.Stale)).ToArray();
        var ranks = ordered.DistinctBy(x => (x.Provider, x.Entry.TrackKey)).ToDictionary(x => (x.Provider, x.Entry.TrackKey), x => x.Entry.Rank);
        var entries = ordered.GroupBy(x => (x.Provider, x.Entry.TrackKey)).Select(group => group.OrderByDescending(x => x.Entry.Availability == "candidate").First()).Select(x => (x.Provider, x.Entry, Track: ToTrack(x.Provider, x.Entry))).Where(x => x.Track is not null).ToArray();
        netease.RememberDaily(entries.Where(x => x.Provider == NeteaseMusicProvider.Id).Select(x => x.Track!));
        qq.Remember(entries.Where(x => x.Provider == QQMusicProvider.Id).Select(x => new QQMusicProvider.Entry(x.Track!, x.Entry.MediaId, x.Entry.MediaSize, default, RequiresMembership: x.Entry.RequiresMembership)));
        var items = catalog.MergeDaily(entries.Select(x => x.Track!)).Select(track => new MusicDailyItem(track,
        [
            .. track.Sources.Where(x => ranks.ContainsKey((x.ProviderId, x.SourceTrackId)))
                .Select(x => new MusicDailyRank(x.ProviderId, ranks[(x.ProviderId, x.SourceTrackId)]))
        ])).ToArray();
        var warnings = results.Where(x => x.Stale).Select(x => x.Provider + (x.Snapshot is null ? ":source_unavailable" : ":stale")).Distinct().ToArray();
        return new MusicDailyPage(name, LocalDate(clock.GetUtcNow()), summaries, items, warnings.Length > 0, warnings);
    }

    public async Task<MusicRecommendationPage> RecommendAsync(CancellationToken ct, QQMembership.Access? access = null)
    {
        MusicDailyPage? page;
        try
        {
            page = await GetDailyAsync(false, ct);
        }
        catch (MusicException error) when (error.Status == 503)
        {
            page = null;
        }

        var entries = page?.Items.Select(x => x.Track) ?? [];
        var tracks = access is null ? catalog.PlayableCandidates(entries) : entries.ToArray();
        if (registry.Enabled.Contains(qq) && (!options.RollingRecommendationsEnabled || access?.Current == true))
            tracks = await skill.PersonalizeAsync(tracks, qq, catalog, ct, access is not null);
        tracks = (await catalog.ProjectAvailabilityAsync(tracks, access, ct)).Where(track => track.Availability == "candidate").ToArray();
        if (tracks.Length == 0) return await FallbackAsync(ct, access);
        return new MusicRecommendationPage(tracks, null, "public_daily_music", page?.Sources.Max(x => x.CapturedAt.UtcDateTime) ?? clock.GetUtcNow().UtcDateTime, page?.Partial ?? true, page?.Warnings ?? ["daily_recommendations:source_unavailable"]);
    }

    public async Task<MusicRecommendationPage> RadioAsync(CancellationToken ct, QQMembership.Access? access = null)
    {
        var tracks = registry.Enabled.Contains(qq) && (!options.RollingRecommendationsEnabled || access?.Current == true) ? await skill.RadioAsync(qq, ct, access is not null) : [];
        var projected = await catalog.ProjectAvailabilityAsync(catalog.MergeDaily(tracks), access, ct);
        return new MusicRecommendationPage([.. projected.Where(track => track.Availability == "candidate")], null, "qq_skill_radio", clock.GetUtcNow().UtcDateTime);
    }

    private async Task<MusicRecommendationPage> FallbackAsync(CancellationToken ct, QQMembership.Access? access)
    {
        var page = await catalog.RecommendAsync(ct, access);
        return page with
        {
            Partial = true,
            Warnings = ["daily_recommendations:source_unavailable", .. page.Warnings ?? []]
        };
    }

    private async Task<SourceResult> ReadAsync(FeedSpec feed, string provider, bool force, CancellationToken ct)
    {
        var state = _states.GetOrAdd((feed.Id, provider), _ => new RefreshState());
        await state.Gate.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            var today = LocalDate(now);
            var previous = store.Latest(feed.Id, provider);
            var old = feed.HasUpstreamDate && previous is not null && LocalDate(previous.SourceUpdatedAt) < today;
            if (force || (now >= state.RetryAt && (previous?.BusinessDate != today || previous.Entries.Any(x => x.TrackId is null) || state.Failed || old)))
            {
                try
                {
                    var snapshot = await FetchAsync(feed, provider, ct);
                    ct.ThrowIfCancellationRequested();
                    if (store.Save(snapshot)) previous = store.Latest(feed.Id, provider);
                    // 榜单尚未发布新一期时，下次有请求且已过半小时再查。
                    state.RetryAt = now.AddMinutes(30);
                    state.Failed = false;
                }
                catch (MusicException error)
                {
                    state.Failed = true;
                    state.RetryAt = now.AddSeconds(Math.Max(1800, error.RetryAfterSeconds ?? 0));
                }
                catch (Exception error) when (error is InvalidOperationException or KeyNotFoundException or ArgumentException or JsonException)
                {
                    state.Failed = true;
                    state.RetryAt = now.AddMinutes(30);
                }
            }

            if (previous is null || previous.BusinessDate < today.AddDays(-1) || previous.Entries.Any(x => x.TrackId is null))
                return new SourceResult(provider, null, true);
            return new SourceResult(provider, previous, state.Failed || previous.BusinessDate != today || feed.HasUpstreamDate && LocalDate(previous.SourceUpdatedAt) < today);
        }
        catch (Exception error) when (error is SqliteException or ApiDatabaseSchemaException or IOException or JsonException)
        {
            return new SourceResult(provider, null, true);
        }
        finally
        {
            state.Gate.Release();
        }
    }

    private async Task<MusicChartSnapshot> FetchAsync(FeedSpec feed, string provider, CancellationToken ct)
    {
        MusicChartEntry[] rows;
        DateTimeOffset? updated;
        if (provider == NeteaseMusicProvider.Id)
        {
            var upstream = await netease.DailyAsync(feed, ct);
            rows = upstream.Tracks.DistinctBy(x => x.Id).Select((track, i) => ToEntry(i + 1, track, null, 0)).ToArray();
            updated = upstream.Updated;
        }
        else
        {
            var upstream = await qq.DailyAsync(feed, ct);
            rows = [.. upstream.Tracks.Select((entry, i) => ToEntry(entry.Rank ?? i + 1, entry.Track, entry.MediaId, entry.Size, entry.RequiresMembership))];
            updated = upstream.Updated;
        }

        var now = clock.GetUtcNow();
        // 上游时间存在正向时钟偏差时钳制到本地当前时间，避免有效榜单被判为未来数据。
        var normalizedUpdated = updated is { } published && published > now ? now : updated;
        var date = normalizedUpdated is { } value ? LocalDate(value) : LocalDate(now);
        if (date > LocalDate(now) || date < LocalDate(now).AddDays(-1)) throw Unavailable();
        return new MusicChartSnapshot(feed.Id, provider, date, now, normalizedUpdated ?? now, Midnight(date), Midnight(date.AddDays(1)), rows);
    }

    private static MusicChartEntry ToEntry(int rank, MusicTrack track, string? mediaId, long size, bool? requiresMembership = null) => new(rank, track.Sources[0].SourceTrackId, track.Title, track.Artists, track.DurationMs, track.Isrc, track.Album, track.CoverUrl, track.Id, track.Availability, mediaId, size, requiresMembership);

    private static MusicTrack? ToTrack(string provider, MusicChartEntry entry) => entry.TrackId is { } id
        ? new MusicTrack(id, entry.Title, entry.Artists, entry.Album, entry.DurationMs, entry.CoverUrl, entry.Isrc,
            entry.Availability ?? "unavailable", [new MusicSource(provider, entry.TrackKey)])
        : null;

    private static DateOnly LocalDate(DateTimeOffset value) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(value, BusinessZone).Date);

    private static DateTimeOffset Midnight(DateOnly date)
    {
        var time = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(time, BusinessZone.GetUtcOffset(time));
    }

    private static MusicException Unavailable() => new("source_unavailable", "今日音乐数据暂不可用。", 503, 30);
}
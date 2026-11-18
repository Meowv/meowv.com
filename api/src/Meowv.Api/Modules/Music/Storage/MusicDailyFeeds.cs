using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed class MusicDailyFeeds(
    MusicChartStore store,
    MusicProviderRegistry registry,
    MusicCatalog catalog,
    NeteaseMusicProvider netease,
    QQMusicProvider qq,
    TimeProvider clock)
{
    private static readonly TimeZoneInfo BusinessZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");

    private readonly Dictionary<(string Feed, string Provider), RefreshState> _states = new()
    {
        [("rising", NeteaseMusicProvider.Id)] = new RefreshState(),
        [("rising", QQMusicProvider.Id)] = new RefreshState(),
        [("new-songs", NeteaseMusicProvider.Id)] = new RefreshState(),
        [("new-songs", QQMusicProvider.Id)] = new RefreshState()
    };

    private sealed class RefreshState
    {
        public readonly SemaphoreSlim Gate = new(1);
        public DateTimeOffset RetryAt;
        public bool Failed;
    }

    private sealed record SourceResult(string Provider, MusicChartSnapshot? Snapshot, bool Stale);

    public Task<MusicDailyPage> GetAsync(string feed, bool force, CancellationToken ct) =>
        GetAsync([feed], feed, force, ct);

    private async Task<MusicDailyPage> GetAsync(string[] feeds, string name, bool force, CancellationToken ct)
    {
        var providers = registry.Enabled.Where(x => x is NeteaseMusicProvider or QQMusicProvider).Select(x => x.ProviderId).ToArray();
        if (providers.Length == 0) throw Unavailable();
        var results = await Task.WhenAll(feeds.SelectMany(feed => providers.Select(provider => ReadAsync(feed, provider, force, ct))));
        var available = results.Where(x => x.Snapshot is not null).ToArray();
        if (available.Length == 0) throw Unavailable();

        var ordered = available.SelectMany(source => source.Snapshot!.Entries.Select(entry => (source.Provider, Entry: entry)))
            .OrderBy(x => x.Entry.Rank).ToArray();
        var summaries = available.Select(x => new MusicDailySource(x.Provider, x.Snapshot!.CapturedAt, x.Snapshot.SourceUpdatedAt, x.Stale)).ToArray();
        var ranks = ordered.DistinctBy(x => (x.Provider, x.Entry.TrackKey))
            .ToDictionary(x => (x.Provider, x.Entry.TrackKey), x => x.Entry.Rank);
        var entries = ordered.GroupBy(x => (x.Provider, x.Entry.TrackKey))
            .Select(group => group.OrderByDescending(x => x.Entry.Availability == "candidate").First())
            .Select(x => (x.Provider, x.Entry, Track: ToTrack(x.Provider, x.Entry))).Where(x => x.Track is not null).ToArray();
        netease.RememberDaily(entries.Where(x => x.Provider == NeteaseMusicProvider.Id).Select(x => x.Track!));
        qq.Remember(entries.Where(x => x.Provider == QQMusicProvider.Id)
            .Select(x => new QQMusicProvider.Entry(x.Track!, x.Entry.MediaId, x.Entry.MediaSize, default)));
        var items = catalog.MergeDaily(entries.Select(x => x.Track!)).Select(track => new MusicDailyItem(track,
        [
            .. track.Sources.Where(x => ranks.ContainsKey((x.ProviderId, x.SourceTrackId)))
                .Select(x => new MusicDailyRank(x.ProviderId, ranks[(x.ProviderId, x.SourceTrackId)]))
        ])).ToArray();
        var warnings = results.Where(x => x.Stale).Select(x => x.Provider + (x.Snapshot is null ? ":source_unavailable" : ":stale")).Distinct().ToArray();
        return new MusicDailyPage(name, LocalDate(clock.GetUtcNow()), summaries, items, warnings.Length > 0, warnings);
    }

    public async Task<MusicRecommendationPage> RecommendAsync(int? limit, string? cursor, CancellationToken ct)
    {
        if (limit is < 1 or > 50 || cursor is { Length: > 128 }) throw MusicException.Invalid();
        if (cursor?.StartsWith("search:", StringComparison.Ordinal) == true)
            return await FallbackAsync(limit, cursor[7..], ct);
        MusicDailyPage page;
        try
        {
            page = await GetAsync(["new-songs", "rising"], "daily", false, ct);
        }
        catch (MusicException error) when (error.Status == 503 && cursor is null)
        {
            return await FallbackAsync(limit, null, ct);
        }

        var tracks = page.Items.Select(x => x.Track).Where(x => x.Availability == "candidate").ToArray();
        if (tracks.Length == 0 && cursor is null) return await FallbackAsync(limit, null, ct);
        var key = string.Join('|', page.Sources.Select(x => x.Source + ":" + x.CapturedAt.ToUnixTimeMilliseconds())) +
                  "|" + string.Join(',', tracks.Select(x => x.Id));
        var version = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)))[..16] + "-";
        var offset = 0;
        if (cursor is not null)
        {
            if (cursor.Length <= version.Length || cursor[version.Length - 1] != '-' ||
                !cursor[..(version.Length - 1)].All(char.IsAsciiHexDigit) ||
                !int.TryParse(cursor.AsSpan(version.Length), NumberStyles.None, CultureInfo.InvariantCulture, out offset) ||
                offset <= 0 || offset >= 120) throw MusicException.Invalid();
            // 午夜或来源恢复后快照变化，客户端从新一期第一页继续，并按曲目 ID 去重。
            if (!cursor.StartsWith(version, StringComparison.Ordinal)) offset = 0;
            else if (offset >= tracks.Length) throw MusicException.Invalid();
        }

        var items = tracks.Skip(offset).Take(limit ?? 20).ToArray();
        var next = offset + items.Length;
        return new MusicRecommendationPage(items, next < tracks.Length ? version + next.ToString(CultureInfo.InvariantCulture) : null,
            "public_daily_music", page.Sources.Max(x => x.CapturedAt.UtcDateTime), page.Partial, page.Warnings);
    }

    private async Task<MusicRecommendationPage> FallbackAsync(int? limit, string? cursor, CancellationToken ct)
    {
        var page = await catalog.RecommendAsync(limit, cursor, ct);
        return page with
        {
            NextCursor = page.NextCursor is null ? null : "search:" + page.NextCursor,
            Partial = true,
            Warnings = ["daily_recommendations:source_unavailable", .. page.Warnings ?? []]
        };
    }

    private async Task<SourceResult> ReadAsync(string feed, string provider, bool force, CancellationToken ct)
    {
        var state = _states[(feed, provider)];
        await state.Gate.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            var today = LocalDate(now);
            var previous = store.Latest(feed, provider);
            var old = feed == "rising" && previous is not null && LocalDate(previous.SourceUpdatedAt) < today;
            if (now >= state.RetryAt && (force || previous?.BusinessDate != today || previous.Entries.Any(x => x.TrackId is null) || state.Failed || old))
            {
                try
                {
                    var snapshot = await FetchAsync(feed, provider, ct);
                    ct.ThrowIfCancellationRequested();
                    if (store.Save(snapshot)) previous = store.Latest(feed, provider);
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
            return new SourceResult(provider, previous,
                state.Failed || previous.BusinessDate != today || feed == "rising" && LocalDate(previous.SourceUpdatedAt) < today);
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

    private async Task<MusicChartSnapshot> FetchAsync(string feed, string provider, CancellationToken ct)
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
            rows = [.. upstream.Tracks.Select((entry, i) => ToEntry(entry.Rank ?? i + 1, entry.Track, entry.MediaId, entry.Size))];
            updated = upstream.Updated;
        }

        var now = clock.GetUtcNow();
        var date = updated is { } published ? LocalDate(published) : LocalDate(now);
        if (date > LocalDate(now) || date < LocalDate(now).AddDays(-1)) throw Unavailable();
        return new MusicChartSnapshot(feed, provider, date, now, updated ?? now, Midnight(date), Midnight(date.AddDays(1)), rows);
    }

    private static MusicChartEntry ToEntry(int rank, MusicTrack track, string? mediaId, long size) =>
        new(rank, track.Sources[0].SourceTrackId, track.Title, track.Artists, track.DurationMs,
            track.Isrc, track.Album, track.CoverUrl, track.Id, track.Availability, mediaId, size);

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
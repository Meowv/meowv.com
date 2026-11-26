using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Infrastructure.Providers;

internal sealed class QQMusicSkill(HttpClient http, MusicOptions options, TimeProvider clock, MusicChartStore store)
{
    private const string DailyFeed = "qq-skill-daily-mix";
    private static readonly TimeZoneInfo BusinessZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");

    private sealed record Song(string Mid, string Title, string Artist);

    private readonly SemaphoreSlim _gate = new(1);
    private DateTimeOffset _dailyRetryAt;
    private DateTimeOffset _radioRetryAt;
    private DateOnly _extraDate;
    private string? _extraSource;
    private Song[] _radioSongs = [];
    private readonly Dictionary<bool, MusicTrack[]> _radio = [];
    private MusicException? _radioFailure;
    private readonly Dictionary<bool, MusicTrack[]> _extra = [];

    private string? Key
    {
        get
        {
            var key = options.QQMusicSkillApiKey.Trim();
            return key.StartsWith("qmk-", StringComparison.Ordinal) && key.Length > 4 && !key.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)) ? key : null;
        }
    }

    public async Task<MusicTrack[]> PersonalizeAsync(MusicTrack[] tracks, QQMusicProvider qq, MusicCatalog catalog, CancellationToken ct,
        bool includeMember = false, bool personalOnly = false)
    {
        if (Key is not { } key) return personalOnly ? [] : tracks;
        var source = "qqskill-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        var token = budget.Token;
        try
        {
            await _gate.WaitAsync(token);
            try
            {
                var now = clock.GetUtcNow();
                var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, BusinessZone).Date);
                var snapshot = store.Latest(DailyFeed, source);
                if (snapshot?.BusinessDate != today && _dailyRetryAt <= now)
                {
                    _dailyRetryAt = now.AddMinutes(10);
                    var songs = await ReadAsync("daily-mix", key, token);
                    token.ThrowIfCancellationRequested();
                    if (songs.Length > 0)
                    {
                        var start = today.ToDateTime(TimeOnly.MinValue);
                        var midnight = new DateTimeOffset(start, BusinessZone.GetUtcOffset(start));
                        var entries = songs.Select((song, index) => new MusicChartEntry(index + 1, song.Mid, song.Title, [song.Artist])).ToArray();
                        store.Save(new MusicChartSnapshot(DailyFeed, source, today, now, now, midnight, midnight.AddDays(1), entries), keepFirstForDate: true);
                        snapshot = store.Latest(DailyFeed, source);
                    }
                }

                if (snapshot?.BusinessDate != today) return personalOnly ? [] : tracks;
                var daily = snapshot.Entries.Select(x => new Song(x.TrackKey, x.Title, x.Artists[0])).ToArray();
                if (_extraDate != today || _extraSource != source)
                {
                    _extraDate = today;
                    _extraSource = source;
                    _extra.Clear();
                }

                if (!_extra.TryGetValue(includeMember, out var extra))
                {
                    extra = await ResolveCandidatesAsync(daily, tracks, qq, token, includeMember);
                    _extra[includeMember] = extra;
                }

                var rank = daily.Select((song, index) => (song.Mid, index)).ToDictionary(x => x.Mid, x => x.index);
                var merged = extra.Length == 0 ? tracks : catalog.MergeDaily(tracks.Concat(extra));
                return
                [
                    .. merged.Where(track => (includeMember || track.Availability == "candidate") && (!personalOnly || track.Sources.Any(s => s.ProviderId == QQMusicProvider.Id && rank.ContainsKey(s.SourceTrackId)))).OrderBy(track => track.Sources.Where(x => x.ProviderId == QQMusicProvider.Id).Select(x => rank.GetValueOrDefault(x.SourceTrackId, int.MaxValue)).DefaultIfEmpty(int.MaxValue).Min())
                ];
            }
            finally
            {
                _gate.Release();
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return personalOnly ? [] : tracks;
        }
        catch (Exception error) when (error is MusicException or SqliteException or ApiDatabaseSchemaException or IOException or JsonException or ArgumentException)
        {
            return personalOnly ? [] : tracks;
        }
    }

    public async Task<MusicTrack[]> RadioAsync(QQMusicProvider qq, CancellationToken ct, bool includeMember = false)
    {
        if (Key is not { } key) return [];
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(6));
        var token = budget.Token;
        try
        {
            await _gate.WaitAsync(token);
            try
            {
                var now = clock.GetUtcNow();
                if (_radioRetryAt > now && _radioFailure is { } cached)
                {
                    var retry = cached.RetryAfterSeconds is not null ? (int?)Math.Ceiling((_radioRetryAt - now).TotalSeconds) : null;
                    throw new MusicException(cached.Code, cached.Message, cached.Status, retry);
                }

                try
                {
                    if (_radioRetryAt <= now)
                    {
                        _radioFailure = null;
                        _radioSongs = await ReadAsync("radio", key, token);
                        _radio.Clear();
                        _radioRetryAt = now.AddSeconds(15);
                    }

                    if (!_radio.TryGetValue(includeMember, out var tracks))
                    {
                        tracks = await ResolveCandidatesAsync(_radioSongs, [], qq, token, includeMember);
                        _radio[includeMember] = tracks;
                    }

                    return tracks;
                }
                catch (MusicException error)
                {
                    _radioFailure = error;
                    _radioRetryAt = now.AddSeconds(Math.Max(15, error.RetryAfterSeconds ?? 0));
                    throw;
                }
            }
            finally
            {
                _gate.Release();
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new MusicException("source_timeout", "QQ 音乐猜你喜欢请求超时。", 504);
        }
    }

    private static async Task<MusicTrack[]> ResolveCandidatesAsync(Song[] songs, MusicTrack[] known, QQMusicProvider qq, CancellationToken ct, bool includeMember)
    {
        var existing = known.SelectMany(x => x.Sources).Where(x => x.ProviderId == QQMusicProvider.Id).Select(x => x.SourceTrackId).ToHashSet(StringComparer.Ordinal);
        var candidates = songs.Where(song => !existing.Contains(song.Mid)).ToArray();
        var results = candidates.Select(song => qq.FindTrack("qq-" + song.Mid)).OfType<MusicTrack>().Where(track => includeMember || track.Availability == "candidate").ToList();
        var found = results.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var missing = candidates.Where(x => !found.Contains("qq-" + x.Mid)).ToArray();
        if (includeMember && missing.Length > 0)
        {
            try
            {
                results.AddRange(await qq.DetailsAsync(missing.Select(x => x.Mid), ct));
                return results.ToArray();
            }
            catch (MusicException)
            {
            }
        }

        foreach (var song in missing.Take(4))
        {
            var query = (song.Title + " " + song.Artist).Trim();
            if (query.Length > 100) continue;
            var page = await qq.SearchAsync(query, 10, null, ct);
            var exact = page.Items.FirstOrDefault(x => x.Id == "qq-" + song.Mid && (includeMember || x.Availability == "candidate"));
            if (exact is not null) results.Add(exact);
        }

        return includeMember ? InSongOrder(candidates, results) : [.. results];
    }

    private static MusicTrack[] InSongOrder(Song[] songs, List<MusicTrack> tracks)
    {
        var byMid = tracks.ToDictionary(track => track.Sources[0].SourceTrackId, StringComparer.Ordinal);
        return songs.Select(song => byMid.GetValueOrDefault(song.Mid)).OfType<MusicTrack>().ToArray();
    }

    private async Task<Song[]> ReadAsync(string endpoint, string key, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://a.y.qq.com/discover/{endpoint}");
        request.Content = new StringContent("""{"params":{},"comm":{"skill_version":"0.0.3"}}""", Encoding.UTF8, "application/json");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                if (endpoint != "radio") return [];
                switch ((int)response.StatusCode)
                {
                    case 429:
                    {
                        var seconds = response.Headers.RetryAfter?.Delta?.TotalSeconds ?? (response.Headers.RetryAfter?.Date - clock.GetUtcNow())?.TotalSeconds ?? 60;
                        throw new MusicException("rate_limited", "QQ 音乐猜你喜欢请求较多，请稍后重试。", 429, (int)Math.Clamp(Math.Ceiling(seconds), 1, 86400));
                    }
                    case 401 or 403:
                        throw new MusicException("forbidden", "QQ 音乐猜你喜欢拒绝了请求。", 403);
                    default:
                        throw new MusicException("source_unavailable", "QQ 音乐猜你喜欢暂不可用。", 503);
                }
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            var buffer = new byte[64 * 1024 + 1];
            var length = await stream.ReadAtLeastAsync(buffer, buffer.Length, false, ct);
            if (length == buffer.Length) throw new JsonException();
            using var json = JsonDocument.Parse(buffer.AsMemory(0, length));
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object || new[] { "ret", "sub_ret" }.Any(code => root.TryGetProperty(code, out var value) && value.ValueKind != JsonValueKind.Null && (value.ValueKind != JsonValueKind.Number || value.GetRawText() != "0")) || !root.TryGetProperty("songlist", out var rows) || rows.ValueKind != JsonValueKind.Array)
                throw new JsonException();
            return
            [
                .. rows.EnumerateArray().Take(30).Select(row =>
                {
                    var mid = Text(row, "songMid");
                    var title = Text(row, "songName").Trim();
                    var artist = Text(row, "singerName").Trim();
                    return mid.Length is >= 8 and <= 24 && mid.All(char.IsAsciiLetterOrDigit) && title.Length is >= 1 and <= 180 && artist.Length is >= 1 and <= 180 && !title.Any(char.IsControl) && !artist.Any(char.IsControl) ? new Song(mid, title, artist) : null;
                }).OfType<Song>().DistinctBy(x => x.Mid)
            ];
        }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException)
        {
            return endpoint == "radio" ? throw new MusicException("source_unavailable", "QQ 音乐猜你喜欢暂不可用。", 503) : [];
        }
    }

    private static string Text(JsonElement row, string key) => row.ValueKind == JsonValueKind.Object && row.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : "";
}

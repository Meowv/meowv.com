using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Meowv.Api.Modules.Music.Contracts;
using Microsoft.AspNetCore.WebUtilities;

namespace Meowv.Api.Modules.Music.Providers;

public sealed class NeteaseMusicProvider(HttpClient http, TimeProvider clock)
{
    public const string Id = "netease";
    public const string ConfigVersion = "netease-v1";
    private readonly object _gate = new();
    private readonly SemaphoreSlim _concurrency = new(2);
    private readonly SemaphoreSlim _search = new(1);
    private readonly Dictionary<string, CachedPage> _pages = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Entry> _tracks = new(StringComparer.Ordinal);
    private DateTimeOffset _window = clock.GetUtcNow();
    private DateTimeOffset _blockedUntil;
    private int _requests;
    private long _pageSequence;
    private long _entrySequence;
    private DateTimeOffset _failedUntil;
    private int _failedStatus;
    private sealed record Entry(string SourceId, MusicTrack Track, DateTimeOffset Until, DateTimeOffset UnplayableUntil = default, long Used = 0);
    private sealed record CachedPage(MusicSearchPage Page, Entry[] Entries, DateTimeOffset Until, long Used);

    public string Status
    {
        get
        {
            lock (_gate)
            {
                var now = clock.GetUtcNow();
                if (_failedUntil > now) return "offline";
                return _blockedUntil > now || _requests >= 40 && _window.AddMinutes(1) > now ? "degraded" : "healthy";
            }
        }
    }

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (query is null || query.Trim().Length is < 1 or > 100 || query.Any(char.IsControl)) throw MusicException.Invalid();
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var normalized = query.Trim().Normalize(NormalizationForm.FormKC);
        var scope = ConfigVersion + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)))[..16] + ":" + count + ":";
        var offset = Cursor(cursor, scope);
        var key = scope + offset.ToString(CultureInfo.InvariantCulture);
        if (Cached(key) is { } cached) return cached;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(6));
        var entered = false;
        try
        {
            await _search.WaitAsync(timeout.Token);
            entered = true;
            if (Cached(key) is { } completed) return completed;
            var page = await LoadSearchAsync(normalized, count, offset, scope, timeout.Token);
            ct.ThrowIfCancellationRequested();
            var entries = page.Items.Select(track => new Entry(track.Sources[0].SourceTrackId, track, clock.GetUtcNow().AddHours(24))).ToArray();
            lock (_gate)
            {
                Remember(entries);
                foreach (var expired in _pages.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _pages.Remove(expired);
                if (_pages.Count >= 32) _pages.Remove(_pages.MinBy(x => x.Value.Used).Key);
                _pages[key] = new CachedPage(page, entries, clock.GetUtcNow().AddSeconds(page.Items.Length == 0 ? 30 : 300), ++_pageSequence);
            }
            return page with { Items = (MusicTrack[])page.Items.Clone() };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw BlockFailure(504, 15); }
        catch (MusicException error) when (error.Status is 503 or 504 && error.RetryAfterSeconds is null) { throw BlockFailure(error.Status, 15); }
        finally { if (entered) _search.Release(); }
    }

    private async Task<MusicSearchPage> LoadSearchAsync(string normalized, int count, int offset, string scope, CancellationToken ct)
    {
        using var body = await SendAsync("/api/search/get/web", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["s"] = normalized, ["type"] = "1", ["limit"] = count.ToString(CultureInfo.InvariantCulture),
            ["offset"] = offset.ToString(CultureInfo.InvariantCulture)
        }), ct);
        if (!body.RootElement.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.Object) throw Unavailable();
        if (!result.TryGetProperty("songs", out var songs)) return new MusicSearchPage([], null, false, []);
        if (songs.ValueKind != JsonValueKind.Array || songs.GetArrayLength() > 100) throw Unavailable();
        var tracks = new List<MusicTrack>();
        foreach (var song in songs.EnumerateArray().Take(count))
        {
            var sourceId = Number(song, "id");
            var title = Text(song, "name");
            var duration = Number(song, "duration");
            if (sourceId <= 0 || title.Length is < 1 or > 500 || duration is < 1 or > 86400000) continue;
            var artists = song.TryGetProperty("artists", out var names) && names.ValueKind == JsonValueKind.Array
                ? names.EnumerateArray().Take(20).Select(x => Text(x, "name")).Where(x => x.Length is > 0 and <= 200).ToArray() : [];
            if (artists.Length == 0) continue;
            var album = song.TryGetProperty("album", out var a) ? Text(a, "name") : "";
            if (album.Length > 500) throw Unavailable();
            var id = "nt-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sourceId.ToString(CultureInfo.InvariantCulture))))[..32].ToLowerInvariant();
            var restricted = Number(song, "fee") is 1 or 4;
            var track = new MusicTrack(id, title, artists, album, duration, null, null,
                restricted ? "unavailable" : "candidate", [new MusicSource(Id, sourceId.ToString(CultureInfo.InvariantCulture))]);
            tracks.Add(track);
        }
        var total = Number(result, "songCount");
        var next = songs.GetArrayLength() >= count && offset + count < 1000 && (total <= 0 || offset + count < total)
            ? WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(scope + (offset + count).ToString(CultureInfo.InvariantCulture))) : null;
        return new MusicSearchPage(tracks.DistinctBy(x => x.Id).ToArray(), next, false, []);
    }

    public async Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        try { return await LoadAudioAsync(request, ct); }
        catch (MusicException error) when (error.Status == 422)
        {
            lock (_gate)
                if (request.TrackId is { } id && _tracks.TryGetValue(id, out var entry))
                    if (entry.UnplayableUntil <= clock.GetUtcNow())
                        _tracks[id] = entry with { UnplayableUntil = clock.GetUtcNow().AddSeconds(30) };
            throw;
        }
        catch (MusicException error) when (error.Status is 503 or 504 && error.RetryAfterSeconds is null) { throw BlockFailure(error.Status, 15); }
    }

    private async Task<MusicResolvedTrack> LoadAudioAsync(MusicResolveRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.TrackId) || request.TrackId.Length > 128 || request.Quality != "auto") throw MusicException.Invalid();
        if (request.PreferredProviderId is not null && request.PreferredProviderId != Id)
            throw new MusicException("forbidden", "此音乐源未启用。", 403);
        Entry? entry;
        lock (_gate)
        {
            _tracks.TryGetValue(request.TrackId, out entry);
            if (entry is not null) _tracks[request.TrackId] = entry with { Used = ++_entrySequence };
        }
        if (entry is null || entry.Until <= clock.GetUtcNow()) throw new MusicException("track_not_found", "歌曲记录已失效，请重新搜索。", 404);
        if (entry.Track.Availability == "unavailable" || entry.UnplayableUntil > clock.GetUtcNow()) throw NoMatch();
        var json = "{\"ids\":[\"" + entry.SourceId + "\"],\"br\":128000,\"csrf_token\":\"\"}";
        using var body = await SendAsync("/weapi/song/enhance/player/url", NeteaseWebProtocol.Encode(json), ct);
        if (!body.RootElement.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() != 1) throw Unavailable();
        var audio = rows[0];
        if (Number(audio, "code") == 429) throw BlockRate(60);
        if (Number(audio, "id") != long.Parse(entry.SourceId, CultureInfo.InvariantCulture) || Number(audio, "code") != 200 ||
            audio.TryGetProperty("freeTrialInfo", out var trial) && trial.ValueKind != JsonValueKind.Null) throw NoMatch();
        var url = SafeAudioUrl(Text(audio, "url"));
        var duration = Number(audio, "time");
        var size = Number(audio, "size");
        var bitrate = Number(audio, "br");
        if (duration == 0 && size is > 0 and <= 2147483648 && bitrate is >= 8000 and <= 512000)
            duration = size * 8000 / bitrate;
        if (url is null || !string.Equals(Text(audio, "type"), "mp3", StringComparison.OrdinalIgnoreCase) ||
            duration < entry.Track.DurationMs!.Value * 0.95 || duration > entry.Track.DurationMs.Value * 1.1) throw NoMatch();
        var expiry = Number(audio, "expi") is > 0 and var seconds ? Math.Min(seconds, 300) : 300;
        return new MusicResolvedTrack(entry.Track.Id, Id, entry.SourceId, 1,
            new MusicAudio(url, "audio/mpeg", entry.Track.DurationMs, clock.GetUtcNow().AddSeconds(expiry).UtcDateTime, true));
    }

    internal static string? SafeAudioUrl(string value)
    {
        if (value.Length > 8192 || !Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") ||
            uri.UserInfo.Length != 0 || uri.Fragment.Length != 0 || !uri.IsDefaultPort ||
            !uri.IdnHost.EndsWith(".music.126.net", StringComparison.OrdinalIgnoreCase)) return null;
        return new UriBuilder(uri) { Scheme = "https", Port = -1 }.Uri.AbsoluteUri;
    }

    private async Task<JsonDocument> SendAsync(string path, HttpContent content, CancellationToken ct)
    {
        using (content)
        {
            lock (_gate)
            {
                var now = clock.GetUtcNow();
                if (now >= _window.AddMinutes(1)) { _window = now; _requests = 0; }
                var until = _blockedUntil;
                if (_requests >= 40 && _window.AddMinutes(1) > until) until = _window.AddMinutes(1);
                if (until > now) throw new MusicException("rate_limited", "音乐源请求较多，请稍后重试。", 429,
                    Math.Max(1, (int)Math.Ceiling((until - now).TotalSeconds)));
                if (_failedUntil > now) throw Failure(_failedStatus, (int)Math.Ceiling((_failedUntil - now).TotalSeconds));
                _requests++;
            }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(6));
            var token = timeout.Token;
            var entered = false;
            try
            {
                await _concurrency.WaitAsync(token);
                entered = true;
                using var request = new HttpRequestMessage(HttpMethod.Post, "https://music.163.com" + path) { Content = content };
                request.Headers.Referrer = new Uri("https://music.163.com/");
                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
                if (response.StatusCode == HttpStatusCode.TooManyRequests) throw BlockRate(RetrySeconds(response, 60));
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) throw BlockFailure(403, 60);
                if (response.StatusCode is HttpStatusCode.GatewayTimeout or HttpStatusCode.RequestTimeout) throw BlockFailure(504, RetrySeconds(response, 15));
                if (!response.IsSuccessStatusCode) throw BlockFailure(503, RetrySeconds(response, 15));
                if (response.Content.Headers.ContentLength > 512 * 1024) throw Unavailable();
                using var stream = await response.Content.ReadAsStreamAsync(token);
                using var bytes = new MemoryStream();
                var buffer = new byte[8192];
                int read;
                while ((read = await stream.ReadAsync(buffer, token)) != 0)
                {
                    if (bytes.Length + read > 512 * 1024) throw Unavailable();
                    bytes.Write(buffer, 0, read);
                }
                var document = JsonDocument.Parse(bytes.ToArray());
                var code = Number(document.RootElement, "code");
                if (code != 200)
                {
                    var retry = RetrySeconds(response, Number(document.RootElement, "retryAfterSeconds") is > 0 and var delay ? delay : 60);
                    document.Dispose();
                    if (code == 429) throw BlockRate(retry);
                    if (code is 301 or 401 or 403) throw BlockFailure(403, 60);
                    throw Unavailable();
                }
                return document;
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw BlockFailure(504, 15); }
            catch (Exception error) when (error is HttpRequestException or JsonException or IOException) { throw BlockFailure(503, 15); }
            finally { if (entered) _concurrency.Release(); }
        }
    }

    // 只缓存元数据页与失败类别；不保存查询原文、播放直链或音频。
    private MusicSearchPage? Cached(string key)
    {
        lock (_gate)
        {
            if (!_pages.TryGetValue(key, out var value)) return null;
            if (value.Until <= clock.GetUtcNow()) { _pages.Remove(key); return null; }
            _pages[key] = value with { Used = ++_pageSequence };
            Remember(value.Entries);
            return value.Page with { Items = (MusicTrack[])value.Page.Items.Clone() };
        }
    }

    private void Remember(Entry[] entries)
    {
        foreach (var expired in _tracks.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _tracks.Remove(expired);
        foreach (var entry in entries)
        {
            var value = _tracks.TryGetValue(entry.Track.Id, out var previous)
                ? entry with { UnplayableUntil = previous.UnplayableUntil } : entry;
            if (_tracks.Count >= 1000 && !_tracks.ContainsKey(entry.Track.Id)) _tracks.Remove(_tracks.MinBy(x => x.Value.Used).Key);
            _tracks[entry.Track.Id] = value with { Used = ++_entrySequence };
        }
    }

    private MusicException BlockRate(int seconds)
    {
        lock (_gate)
        {
            var until = clock.GetUtcNow().AddSeconds(seconds);
            if (until > _blockedUntil) _blockedUntil = until;
            return new MusicException("rate_limited", "音乐源请求较多，请稍后重试。", 429,
                Math.Max(1, (int)Math.Ceiling((_blockedUntil - clock.GetUtcNow()).TotalSeconds)));
        }
    }

    private MusicException BlockFailure(int status, int seconds)
    {
        lock (_gate)
        {
            var until = clock.GetUtcNow().AddSeconds(seconds);
            if (until > _failedUntil) { _failedUntil = until; _failedStatus = status; }
            return Failure(_failedStatus, Math.Max(1, (int)Math.Ceiling((_failedUntil - clock.GetUtcNow()).TotalSeconds)));
        }
    }

    private static MusicException Failure(int status, int seconds) => status switch
    {
        403 => new MusicException("forbidden", "音乐源暂不允许访问。", 403, seconds),
        504 => new MusicException("source_timeout", "音乐源响应超时，请稍后重试。", 504, seconds),
        _ => new MusicException("source_unavailable", "音乐源暂时不可用，请稍后重试。", 503, seconds)
    };

    private int RetrySeconds(HttpResponseMessage response, long fallback) => (int)Math.Clamp(Math.Ceiling(
        response.Headers.RetryAfter?.Delta?.TotalSeconds ??
        (response.Headers.RetryAfter?.Date - clock.GetUtcNow())?.TotalSeconds ?? fallback), 1, 86400);

    private static int Cursor(string? value, string scope)
    {
        if (value is null) return 0;
        try
        {
            if (value.Length > 128) throw MusicException.Invalid();
            var text = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(value));
            if (!text.StartsWith(scope, StringComparison.Ordinal) || !int.TryParse(text[scope.Length..], NumberStyles.None,
                    CultureInfo.InvariantCulture, out var offset) || offset is < 1 or >= 1000) throw MusicException.Invalid();
            return offset;
        }
        catch (FormatException) { throw MusicException.Invalid(); }
    }

    private static long Number(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.Number && x.TryGetInt64(out var number) ? number : 0;
    private static string Text(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.String ? x.GetString() ?? "" : "";
    private static MusicException Unavailable() => new("source_unavailable", "音乐源暂时不可用。", 503);
    private static MusicException NoMatch() => new("no_playable_match", "当前歌曲暂无可用的完整音频。", 422);
}

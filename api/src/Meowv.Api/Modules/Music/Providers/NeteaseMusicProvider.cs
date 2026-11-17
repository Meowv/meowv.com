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
    private readonly Dictionary<string, Entry> _tracks = new(StringComparer.Ordinal);
    private DateTimeOffset _window = clock.GetUtcNow();
    private DateTimeOffset _blockedUntil;
    private int _requests;
    private sealed record Entry(string SourceId, MusicTrack Track, DateTimeOffset Until);

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        if (query is null || query.Trim().Length is < 1 or > 100 || query.Any(char.IsControl)) throw MusicException.Invalid();
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var normalized = query.Trim().Normalize(NormalizationForm.FormKC);
        var scope = ConfigVersion + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)))[..16] + ":" + count + ":";
        var offset = Cursor(cursor, scope);
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
            lock (_gate)
            {
                foreach (var expired in _tracks.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _tracks.Remove(expired);
                if (_tracks.Count >= 1000 && !_tracks.ContainsKey(id)) _tracks.Remove(_tracks.Keys.First());
                _tracks[id] = new Entry(sourceId.ToString(CultureInfo.InvariantCulture), track, clock.GetUtcNow().AddHours(24));
            }
            tracks.Add(track);
        }
        var next = songs.GetArrayLength() >= count && offset + count < 1000
            ? WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(scope + (offset + count).ToString(CultureInfo.InvariantCulture))) : null;
        return new MusicSearchPage(tracks.DistinctBy(x => x.Id).ToArray(), next, false, []);
    }

    public async Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.TrackId) || request.TrackId.Length > 128 || request.Quality != "auto") throw MusicException.Invalid();
        if (request.PreferredProviderId is not null && request.PreferredProviderId != Id)
            throw new MusicException("forbidden", "此音乐源未启用。", 403);
        Entry? entry;
        lock (_gate) _tracks.TryGetValue(request.TrackId, out entry);
        if (entry is null || entry.Until <= clock.GetUtcNow()) throw new MusicException("track_not_found", "歌曲记录已失效，请重新搜索。", 404);
        if (entry.Track.Availability == "unavailable") throw NoMatch();
        var json = "{\"ids\":[\"" + entry.SourceId + "\"],\"br\":128000,\"csrf_token\":\"\"}";
        using var body = await SendAsync("/weapi/song/enhance/player/url", NeteaseWebProtocol.Encode(json), ct);
        if (!body.RootElement.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() != 1) throw Unavailable();
        var audio = rows[0];
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
                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    var seconds = response.Headers.RetryAfter?.Delta?.TotalSeconds ??
                        (response.Headers.RetryAfter?.Date - clock.GetUtcNow())?.TotalSeconds ?? 60;
                    var retry = (int)Math.Clamp(Math.Ceiling(seconds), 1, 86400);
                    lock (_gate) _blockedUntil = clock.GetUtcNow().AddSeconds(retry);
                    throw new MusicException("rate_limited", "音乐源请求较多，请稍后重试。", 429, retry);
                }
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                    throw new MusicException("forbidden", "音乐源暂不允许访问。", 403);
                if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 512 * 1024) throw Unavailable();
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
                if (Number(document.RootElement, "code") != 200) { document.Dispose(); throw Unavailable(); }
                return document;
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new MusicException("source_timeout", "音乐源响应超时。", 504); }
            catch (Exception error) when (error is HttpRequestException or JsonException or IOException) { throw Unavailable(); }
            finally { if (entered) _concurrency.Release(); }
        }
    }

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

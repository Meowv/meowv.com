using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Meowv.Api.Modules.Music.Contracts;
using Microsoft.AspNetCore.WebUtilities;

namespace Meowv.Api.Modules.Music.Providers;

// 当前只接公开元数据；不实现伪造Secret/Cookie的播放备用路径。
public sealed class KuwoSearchProvider(HttpClient http, TimeProvider clock) : IMusicSearchProvider
{
    public const string Id = "kuwo-search";
    public string ProviderId => Id;
    public string DisplayName => "酷我音乐";
    public string Version => "kuwo-search-v1";
    private readonly object _gate = new();
    private readonly SemaphoreSlim _load = new(1);
    private readonly Dictionary<string, (MusicSearchPage Page, DateTimeOffset Until, long Used)> _pages = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (MusicTrack Track, DateTimeOffset Until, long Used)> _tracks = new(StringComparer.Ordinal);
    private DateTimeOffset _window = clock.GetUtcNow();
    private DateTimeOffset _blocked;
    private int _blockedStatus;
    private int _requests;
    private long _used;
    public string Status { get { lock (_gate) return _blocked > clock.GetUtcNow() ? _blockedStatus == 429 ? "degraded" : "offline" : "healthy"; } }
    public MusicTrack? FindTrack(string id)
    {
        lock (_gate) return _tracks.TryGetValue(id, out var entry) && entry.Until > clock.GetUtcNow() ? entry.Track : null;
    }

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (query is null || query.Trim().Length is < 1 or > 100 || query.Any(char.IsControl)) throw MusicException.Invalid();
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var normalized = query.Trim().Normalize(NormalizationForm.FormKC);
        var prefix = Version + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)))[..16] + ":" + count + ":";
        var offset = 0;
        if (cursor is not null)
        {
            try
            {
                if (cursor.Length > 128) throw MusicException.Invalid();
                var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(cursor));
                if (!decoded.StartsWith(prefix, StringComparison.Ordinal) || !int.TryParse(decoded[prefix.Length..], NumberStyles.None,
                        CultureInfo.InvariantCulture, out offset) || offset is < 1 or > 49) throw MusicException.Invalid();
            }
            catch (FormatException) { throw MusicException.Invalid(); }
        }
        var key = prefix + offset;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(6));
        var entered = false;
        try
        {
            await _load.WaitAsync(timeout.Token); entered = true;
            lock (_gate)
            {
                if (_pages.TryGetValue(key, out var cached) && cached.Until > clock.GetUtcNow())
                {
                    _pages[key] = (cached.Page, cached.Until, ++_used);
                    Remember(cached.Page);
                    return cached.Page with { Items = (MusicTrack[])cached.Page.Items.Clone() };
                }
                if (_blocked > clock.GetUtcNow()) throw Failure(_blockedStatus, (int)Math.Ceiling((_blocked - clock.GetUtcNow()).TotalSeconds));
                if (_window.AddMinutes(1) <= clock.GetUtcNow()) { _window = clock.GetUtcNow(); _requests = 0; }
                if (_requests >= 20) throw Block(429, Math.Max(1, (int)Math.Ceiling((_window.AddMinutes(1) - clock.GetUtcNow()).TotalSeconds)));
                _requests++;
            }
            var values = new Dictionary<string, string?>
            {
                ["all"] = normalized, ["ft"] = "music", ["client"] = "kt", ["strategy"] = "2012", ["encoding"] = "utf8",
                ["rformat"] = "json", ["mobi"] = "1", ["issubtitle"] = "1", ["pn"] = offset.ToString(CultureInfo.InvariantCulture),
                ["rn"] = count.ToString(CultureInfo.InvariantCulture)
            };
            using var request = new HttpRequestMessage(HttpMethod.Get, QueryHelpers.AddQueryString("https://www.kuwo.cn/search/searchMusicBykeyWord", values));
            request.Headers.Referrer = new Uri("https://www.kuwo.cn/");
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                throw Block(429, (int)Math.Clamp(response.Headers.RetryAfter?.Delta?.TotalSeconds ?? 60, 1, 86400));
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) throw Block(403, 60);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 512 * 1024) throw Block(503, 15);
            using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var bytes = new MemoryStream();
            var buffer = new byte[8192]; int read;
            while ((read = await stream.ReadAsync(buffer, timeout.Token)) != 0)
            {
                if (bytes.Length + read > 512 * 1024) throw Block(503, 15);
                bytes.Write(buffer, 0, read);
            }
            using var json = JsonDocument.Parse(bytes.ToArray());
            if (!json.RootElement.TryGetProperty("abslist", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 100) throw Block(503, 15);
            var items = new List<MusicTrack>();
            foreach (var row in rows.EnumerateArray().Take(count))
            {
                var sourceId = Text(row, "MUSICRID").Replace("MUSIC_", "", StringComparison.Ordinal);
                var name = WebUtility.HtmlDecode(Text(row, "SONGNAME"));
                if (!long.TryParse(sourceId, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number <= 0 || name.Length is < 1 or > 500) continue;
                var artists = WebUtility.HtmlDecode(Text(row, "ARTIST")).Split('&', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                if (artists.Length is < 1 or > 20 || artists.Any(x => x.Length > 200)) continue;
                var album = WebUtility.HtmlDecode(Text(row, "ALBUM"));
                if (album.Length > 500) continue;
                var duration = long.TryParse(Text(row, "DURATION"), NumberStyles.None, CultureInfo.InvariantCulture, out var seconds) && seconds is > 0 and <= 86400 ? seconds * 1000 : (long?)null;
                var id = "kw-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sourceId)))[..32].ToLowerInvariant();
                items.Add(new MusicTrack(id, name, artists, album, duration, null, null, "metadata_only", [new MusicSource(Id, sourceId)]));
            }
            var total = long.TryParse(Text(json.RootElement, "TOTAL"), out var t) ? t : 0;
            var next = rows.GetArrayLength() >= count && offset < 49 && (total <= 0 || (offset + 1) * count < total)
                ? WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(prefix + (offset + 1).ToString(CultureInfo.InvariantCulture))) : null;
            var page = new MusicSearchPage(items.DistinctBy(x => x.Id).ToArray(), next, false, []);
            timeout.Token.ThrowIfCancellationRequested();
            lock (_gate)
            {
                Remember(page);
                foreach (var old in _pages.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _pages.Remove(old);
                if (_pages.Count >= 32) _pages.Remove(_pages.MinBy(x => x.Value.Used).Key);
                _pages[key] = (page, clock.GetUtcNow().AddSeconds(page.Items.Length == 0 ? 30 : 300), ++_used);
            }
            return page with { Items = (MusicTrack[])page.Items.Clone() };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw Block(504, 15); }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException or InvalidOperationException) { throw Block(503, 15); }
        finally { if (entered) _load.Release(); }
    }

    private void Remember(MusicSearchPage page)
    {
        foreach (var old in _tracks.Where(x => x.Value.Until <= clock.GetUtcNow()).Select(x => x.Key).ToArray()) _tracks.Remove(old);
        foreach (var item in page.Items)
        {
            if (_tracks.Count >= 1000 && !_tracks.ContainsKey(item.Id)) _tracks.Remove(_tracks.MinBy(x => x.Value.Used).Key);
            _tracks[item.Id] = (item, clock.GetUtcNow().AddHours(24), ++_used);
        }
    }
    private MusicException Block(int status, int seconds)
    {
        lock (_gate)
        {
            var until = clock.GetUtcNow().AddSeconds(seconds);
            if (until > _blocked) { _blocked = until; _blockedStatus = status; }
            return Failure(_blockedStatus, Math.Max(1, (int)Math.Ceiling((_blocked - clock.GetUtcNow()).TotalSeconds)));
        }
    }
    private static MusicException Failure(int status, int seconds) => status switch
    {
        429 => new("rate_limited", "元数据源请求较多，请稍后重试。", 429, seconds),
        403 => new("forbidden", "元数据源暂不允许访问。", 403, seconds),
        504 => new("source_timeout", "元数据源响应超时。", 504, seconds),
        _ => new("source_unavailable", "元数据源暂时不可用。", 503, seconds)
    };
    private static string Text(JsonElement row, string key) => row.ValueKind == JsonValueKind.Object && row.TryGetProperty(key, out var x)
        ? x.ValueKind == JsonValueKind.String ? x.GetString() ?? "" : x.ValueKind == JsonValueKind.Number ? x.GetRawText() : "" : "";
}

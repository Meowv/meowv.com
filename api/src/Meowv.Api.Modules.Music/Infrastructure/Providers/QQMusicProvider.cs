using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Meowv.Api.Modules.Music.Infrastructure.Providers;

public sealed class QQMusicProvider(HttpClient http, TimeProvider clock) : IMusicSearchProvider, IMusicResolverProvider, IMusicLyricsProvider
{
    public const string Id = "qqmusic";
    private const string Referer = "https://y.qq.com/";
    private const string Endpoint = "https://u.y.qq.com/cgi-bin/musicu.fcg?data=";
    private static readonly TimeZoneInfo BusinessZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");
    private readonly ConcurrentDictionary<string, Entry> _tracks = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _requests = new(2);
    private readonly Lock _gate = new();
    private DateTimeOffset _retryAt;
    private int _failureStatus;

    internal sealed record Entry(MusicTrack Track, string? MediaId, long Size, DateTimeOffset Deadline, int? Rank = null, DateTimeOffset UnplayableUntil = default, bool? RequiresMembership = null);

    public string ProviderId => Id;
    public string DisplayName => "QQ 音乐";
    public string Version => "qqmusic-v1";

    public string Status
    {
        get
        {
            lock (_gate) return _retryAt <= clock.GetUtcNow() ? "healthy" : _failureStatus == 429 ? "rate_limited" : "degraded";
        }
    }

    public MusicTrack? FindTrack(string id)
    {
        var now = clock.GetUtcNow();
        if (!_tracks.TryGetValue(id, out var entry) || entry.Deadline <= now) return null;
        return entry.UnplayableUntil > now ? entry.Track with { Availability = "unavailable" } : entry.Track;
    }

    internal Entry? Candidate(string sourceId) => _tracks.TryGetValue("qq-" + sourceId, out var entry) && entry.Deadline > clock.GetUtcNow() ? entry : null;

    internal void Remember(IEnumerable<Entry> entries)
    {
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            var deadline = now.AddHours(24);
            foreach (var entry in entries)
            {
                var unplayable = _tracks.TryGetValue(entry.Track.Id, out var previous) && previous.UnplayableUntil > now ? previous.UnplayableUntil : default;
                var details = entry.RequiresMembership is null && previous?.RequiresMembership is not null ? entry with { MediaId = previous.MediaId, Size = previous.Size, RequiresMembership = previous.RequiresMembership } : entry;
                _tracks[entry.Track.Id] = details with { Deadline = deadline, UnplayableUntil = unplayable };
            }

            var overflow = _tracks.Count - 1000;
            if (overflow > 0)
                foreach (var old in _tracks.OrderBy(x => x.Value.Deadline).Take(overflow))
                    _tracks.TryRemove(old.Key, out _);
        }
    }

    public async Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        var text = query?.Trim();
        if (text is not { Length: >= 1 and <= 100 } || text.Any(char.IsControl) || limit is < 1 or > 50) throw MusicException.Invalid();
        var count = limit ?? 20;
        var page = 1;
        if (cursor is not null && (!int.TryParse(cursor, NumberStyles.None, CultureInfo.InvariantCulture, out page) || page is < 2 or > 50))
            throw MusicException.Invalid();
        var args = $$"""{"query":{{JsonSerializer.Serialize(text, MusicJsonContext.Default.String)}},"page_num":{{page}},"num_per_page":{{count}},"search_type":0}""";
        using var body = await CallAsync("music.search.SearchCgiService", "DoSearchForQQMusicDesktop", args, ct, includeWebContext: false);
        var song = At(Data(body), "body", "song");
        var rows = At(song, "list");
        if (rows.ValueKind is not JsonValueKind.Array) throw Failure(503);
        var entries = ParseEntries(rows, count);
        Remember(entries);
        var total = Number(song, "totalnum");
        var next = rows.GetArrayLength() >= count && page < 50 && (total == 0 || count * page < total) ? (page + 1).ToString(CultureInfo.InvariantCulture) : null;
        return new MusicSearchPage([.. entries.Select(x => x.Track)], next, false, []);
    }

    internal async Task<(Entry[] Tracks, DateTimeOffset? Updated)> DailyAsync(FeedSpec spec, CancellationToken ct)
    {
        if (spec.Kind == "toplist")
        {
            var topId = long.Parse(spec.UpstreamId, CultureInfo.InvariantCulture);
            var args = "{\"topid\":" + topId + ",\"offset\":0,\"num\":" + spec.Limit + "}";
            using var body = await CallAsync("musicToplist.ToplistInfoServer", "GetDetail", args, ct);
            var data = Data(body);
            var chart = At(data, "data");
            if (Number(chart, "topId") != topId || !DateOnly.TryParseExact(Text(chart, "updateTime"), "yyyy-MM-dd",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) throw Failure(503);
            var ranks = At(chart, "song");
            var details = At(data, "songInfoList");
            if (ranks.ValueKind is not JsonValueKind.Array || details.ValueKind is not JsonValueKind.Array || ranks.GetArrayLength() < 1 || ranks.GetArrayLength() > spec.Limit || details.GetArrayLength() != ranks.GetArrayLength())
                throw Failure(503);
            var byId = details.EnumerateArray().ToDictionary(x => Number(x, "id"));
            var songs = new List<Entry>();
            foreach (var row in ranks.EnumerateArray())
            {
                var rank = Number(row, "rank");
                if (rank is < 1 || rank > spec.Limit || !byId.TryGetValue(Number(row, "songId"), out var detail)) throw Failure(503);
                if (ParseEntry(detail) is { } parsed) songs.Add(parsed with { Rank = (int)rank });
            }

            var midnight = date.ToDateTime(TimeOnly.MinValue);
            return (songs.OrderBy(x => x.Rank).DistinctBy(x => x.Track.Id).ToArray(),
                new DateTimeOffset(midnight, BusinessZone.GetUtcOffset(midnight)));
        }

        using var recommendations = await CallAsync("QQMusic.MusichallServer", "GetNewSong", "{\"type\":" + spec.UpstreamId + "}", ct);
        return (ParseEntries(At(Data(recommendations), "song_list"), spec.Limit), null);
    }

    internal async Task<MusicTrack[]> DetailsAsync(IEnumerable<string> mids, CancellationToken ct)
    {
        var ids = mids.Where(ValidId).Distinct(StringComparer.Ordinal).Take(30).ToArray();
        if (ids.Length == 0) return [];
        var keys = JsonSerializer.Serialize(ids, MusicJsonContext.Default.StringArray);
        var zeros = string.Join(',', Enumerable.Repeat("0", ids.Length));
        var args = $$"""{"ctx":0,"client":1,"types":[{{zeros}}],"modify_stamp":[{{zeros}}],"mids":{{keys}}}""";
        using var body = await CallAsync("music.trackInfo.UniformRuleCtrl", "CgiGetTrackInfo", args, ct, affectAvailability: false);
        var rows = At(Data(body), "tracks");
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > ids.Length) throw Failure(503);
        var entries = ParseEntries(rows, ids.Length).Where(entry => ids.Contains(entry.Track.Sources[0].SourceTrackId, StringComparer.Ordinal)).ToArray();
        Remember(entries);
        return entries.Select(entry => entry.Track).ToArray();
    }

    internal async Task<QQAccountClient.Mp3[]> MemberTracksAsync(IEnumerable<string> mids, CancellationToken ct)
    {
        var ids = mids.Where(ValidId).Distinct(StringComparer.Ordinal).ToArray();
        var now = clock.GetUtcNow();
        var missing = ids.Where(mid => !_tracks.TryGetValue("qq-" + mid, out var entry) || entry.Deadline <= now || entry.RequiresMembership is null).Take(30).ToArray();
        if (missing.Length > 0)
        {
            try
            {
                await DetailsAsync(missing, ct);
            }
            catch (MusicException)
            {
            }
        }

        var results = new List<QQAccountClient.Mp3>();
        foreach (var mid in ids)
        {
            if (_tracks.TryGetValue("qq-" + mid, out var entry) && entry.Deadline > now &&
                entry is { RequiresMembership: true, MediaId: { } mediaId, Size: > 0 })
                results.Add(new QQAccountClient.Mp3(mid, mediaId, entry.Size));
        }

        return [.. results];
    }

    internal async Task<MusicResolvedTrack> ResolveMemberAsync(string id, QQMembership.Access access, CancellationToken ct)
    {
        var mid = id.StartsWith("qq-", StringComparison.Ordinal) ? id[3..] : "";
        if (!ValidId(mid) || FindTrack(id) is null) throw NoMatch();
        var songs = await MemberTracksAsync([mid], ct);
        if (songs.Length == 0 || !_tracks.TryGetValue(id, out var entry)) throw NoMatch();
        var resource = await access.ResolveAsync(songs[0], ct);
        if (resource is null) throw NoMatch();
        return new MusicResolvedTrack(id, Id, mid, 1,
            new MusicAudio(resource.Url.AbsoluteUri, "audio/mpeg", entry.Track.DurationMs, resource.ExpiresAt.UtcDateTime, true));
    }

    public async Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        if (request.TrackId is not { } id || request.Quality != "auto") throw MusicException.Invalid();
        if (request.PreferredProviderId is not null and not Id) throw Failure(403);
        if (!_tracks.TryGetValue(id, out var entry) || entry.Deadline <= clock.GetUtcNow())
            throw new MusicException("track_not_found", "歌曲记录已失效，请重新搜索。", 404);
        if (entry.UnplayableUntil > clock.GetUtcNow()) throw NoMatch();
        try
        {
            if (entry.Track.Availability != "candidate" || entry.MediaId is not { } mediaId || entry.Size <= 0) throw NoMatch();
            var sourceId = entry.Track.Sources[0].SourceTrackId;
            if (!ValidId(sourceId) || !ValidId(mediaId)) throw NoMatch();
            var file = "M500" + mediaId + ".mp3";
            var args = $$"""{"guid":"10000","songmid":["{{sourceId}}"],"songtype":[0],"uin":"0","loginflag":0,"platform":"20","filename":["{{file}}"]}""";
            using var body = await CallAsync("vkey.GetVkeyServer", "CgiGetVkey", args, ct);
            var data = Data(body);
            var info = At(data, "midurlinfo");
            if (info.ValueKind != JsonValueKind.Array || info.GetArrayLength() != 1) throw Failure(503);
            var row = info[0];
            var path = Text(row, "purl");
            if (Text(row, "songmid") != sourceId || At(row, "result").ValueKind != JsonValueKind.Number || Number(row, "result") != 0 || !path.StartsWith(file + "?", StringComparison.Ordinal) || path.Length > 4096)
                throw NoMatch();
            var cdns = At(data, "sip");
            if (cdns.ValueKind != JsonValueKind.Array) throw NoMatch();
            foreach (var item in cdns.EnumerateArray().Take(3))
            {
                if (item.ValueKind != JsonValueKind.String || !Uri.TryCreate(item.GetString(), UriKind.Absolute, out var host) || !host.IsDefaultPort || host.AbsolutePath != "/" || host.UserInfo.Length != 0 || host.Query.Length != 0 || host.Fragment.Length != 0 || host.Scheme is not ("http" or "https") || !(host.IdnHost == "aqqmusic.tc.qq.com" || host.IdnHost.EndsWith(".stream.qqmusic.qq.com", StringComparison.Ordinal)))
                    continue;
                var cdn = new UriBuilder(host) { Scheme = "https", Port = -1 }.Uri;
                if (!Uri.TryCreate(cdn, path, out var url) || url.IdnHost != cdn.IdnHost || url.AbsolutePath != "/" + file || url.Fragment.Length != 0) continue;
                using var probe = new HttpRequestMessage(HttpMethod.Get, url);
                // 读响应头，验证服务端支持 Range 且资源长度与上游给出的整曲文件一致。
                probe.Headers.Range = new RangeHeaderValue(0, 0);
                using var response = await SendAsync(probe, ct);
                if (response.StatusCode != HttpStatusCode.PartialContent || response.Content.Headers.ContentRange is not { From: 0, To: 0 } range || range.Length != entry.Size)
                    continue;
                return new MusicResolvedTrack(id, Id, sourceId, 1,
                    new MusicAudio(url.AbsoluteUri, "audio/mpeg", entry.Track.DurationMs, clock.GetUtcNow().AddMinutes(5).UtcDateTime, true));
            }

            throw NoMatch();
        }
        catch (MusicException error) when (error.Status == 422)
        {
            lock (_gate)
                if (_tracks.TryGetValue(id, out var current) && current.UnplayableUntil <= clock.GetUtcNow())
                    _tracks[id] = current with { UnplayableUntil = clock.GetUtcNow().AddSeconds(30) };
            throw;
        }
    }

    public async Task<string?> LyricsAsync(string sourceId, CancellationToken ct)
    {
        if (!ValidId(sourceId)) return null;
        using var body = await ReadJsonAsync("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&nobase64=1&songmid=" + sourceId, ct);
        return Number(body.RootElement, "code") == 0 ? WebUtility.HtmlDecode(Text(body.RootElement, "lyric")) : null;
    }

    private async Task<JsonDocument> CallAsync(string module, string method, string args, CancellationToken ct, bool includeWebContext = true,
        bool affectAvailability = true)
    {
        var context = includeWebContext ? """ "comm":{"ct":24,"cv":0}, """ : "";
        var payload = $$"""{ {{context}} "req":{"module":"{{module}}","method":"{{method}}","param":{{args}}""" + "}}";
        var body = await ReadJsonAsync(Endpoint + Uri.EscapeDataString(payload), ct, affectAvailability);
        if (At(body.RootElement, "code").ValueKind == JsonValueKind.Number && Number(body.RootElement, "code") == 0 &&
            At(body.RootElement, "req", "code").ValueKind == JsonValueKind.Number && Number(At(body.RootElement, "req"), "code") == 0) return body;
        body.Dispose();
        throw Failure(503);
    }

    private async Task<JsonDocument> ReadJsonAsync(string url, CancellationToken ct, bool affectAvailability = true)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(6));
        var token = timeout.Token;
        try
        {
            await _requests.WaitAsync(token);
            try
            {
                lock (_gate)
                {
                    var seconds = (int)Math.Ceiling((_retryAt - clock.GetUtcNow()).TotalSeconds);
                    if (seconds > 0) throw Failure(_failureStatus, seconds);
                }

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Referrer = new Uri(Referer);
                request.Headers.UserAgent.ParseAdd("Mozilla/5.0");
                using var response = await SendAsync(request, token);
                if (!response.IsSuccessStatusCode)
                {
                    var status = (int)response.StatusCode;
                    if (status is not (403 or 429)) status = 503;
                    var delay = response.Headers.RetryAfter;
                    var now = clock.GetUtcNow();
                    var until = delay?.Date ?? now + (delay?.Delta ?? TimeSpan.FromSeconds(status == 503 ? 15 : 60));
                    var seconds = (int)Math.Clamp(Math.Ceiling((until - now).TotalSeconds), 1, 86400);
                    if (affectAvailability || status == 429)
                    {
                        lock (_gate)
                        {
                            _retryAt = now.AddSeconds(seconds);
                            _failureStatus = status;
                        }
                    }

                    throw Failure(status, seconds);
                }

                const int max = 1024 * 1024;
                if (response.Content.Headers.ContentLength > max) throw Failure(503);
                await using var stream = await response.Content.ReadAsStreamAsync(token);
                var bytes = new byte[max + 1];
                var length = await stream.ReadAtLeastAsync(bytes, bytes.Length, false, token);
                return length > max ? throw Failure(503) : JsonDocument.Parse(bytes.AsMemory(0, length));
            }
            finally
            {
                _requests.Release();
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw Failure(504);
        }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException)
        {
            throw Failure(503);
        }
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try
        {
            return await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw Failure(504);
        }
        catch (HttpRequestException)
        {
            throw Failure(503);
        }
    }

    private static Entry[] ParseEntries(JsonElement songs, int count)
    {
        return songs.ValueKind != JsonValueKind.Array ? throw Failure(503) : [.. songs.EnumerateArray().Take(count).Select(ParseEntry).OfType<Entry>().DistinctBy(x => x.Track.Id)];
    }

    private static Entry? ParseEntry(JsonElement song)
    {
        var mid = Text(song, "mid");
        var title = Text(song, "title");
        var interval = Number(song, "interval");
        var singers = At(song, "singer");
        if (!ValidId(mid) || !ValidText(title) || interval is < 1 or > 86400 || singers.ValueKind != JsonValueKind.Array) return null;
        var artists = singers.EnumerateArray().Take(8).Select(x => Text(x, "name")).Where(ValidText).ToArray();
        if (artists.Length == 0) return null;
        var album = At(song, "album");
        var albumId = Text(album, "mid");
        var albumName = Text(album, "name");
        var cover = ValidId(albumId) ? $"https://y.gtimg.cn/music/photo_new/T002R500x500M000{albumId}.jpg" : null;
        var file = At(song, "file");
        var mediaId = Text(file, "media_mid");
        var size = Number(file, "size_128mp3");
        var pay = At(song, "pay", "pay_play");
        var preview = song.TryGetProperty("preview", out var trial) && (trial.ValueKind is JsonValueKind.True || Number(song, "preview") == 1);
        var fullMp3 = ValidId(mediaId) && size >= interval * 15000 && size <= interval * 17500;
        var cost = pay.ValueKind == JsonValueKind.Number && pay.TryGetInt64(out var price) ? price : -1;
        var playable = cost == 0 && !preview && fullMp3;
        var track = new MusicTrack("qq-" + mid, title, artists, ValidText(albumName) ? albumName : null, interval * 1000, cover, null, playable ? "candidate" : "unavailable", [new MusicSource(Id, mid)]);
        return new Entry(track, fullMp3 ? mediaId : null, fullMp3 ? size : 0, default, RequiresMembership: cost > 0);
    }

    private static bool ValidText(string text) => text.Length is > 0 and <= 180 && !text.Any(char.IsControl);
    private static bool ValidId(string value) => value.Length is >= 8 and <= 24 && value.All(char.IsAsciiLetterOrDigit);
    private static JsonElement Data(JsonDocument json) => At(json.RootElement, "req", "data");

    private static JsonElement At(JsonElement value, params string[] path)
    {
        foreach (var name in path)
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(name, out value))
                return default;
        return value;
    }

    private static string Text(JsonElement value, string name) => At(value, name) is { ValueKind: JsonValueKind.String } text ? text.GetString() ?? "" : "";
    private static long Number(JsonElement value, string name) => At(value, name) is { ValueKind: JsonValueKind.Number } number && number.TryGetInt64(out var result) ? result : 0;
    private static MusicException NoMatch() => new("no_playable_match", "QQ 音乐未提供可用的完整音频。", 422);

    private static MusicException Failure(int status, int? retry = null) => status switch
    {
        403 => new MusicException("forbidden", "QQ 音乐拒绝了此请求。", status, retry),
        429 => new MusicException("rate_limited", "QQ 音乐请求较多，请稍后重试。", status, retry),
        504 => new MusicException("source_timeout", "QQ 音乐请求超时。", status, retry),
        _ => new MusicException("source_unavailable", "QQ 音乐暂时不可用。", 503, retry)
    };
}

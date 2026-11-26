using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace Meowv.Api.Modules.Music.Infrastructure.Persistence;

internal sealed class QQAccountClient(HttpClient http, TimeProvider clock)
{
    private const string Gateway = "https://u.y.qq.com/cgi-bin/musicu.fcg";
    private const string ClientVersion = "20090008";
    private readonly string _device = Guid.NewGuid().ToString("N");

    internal sealed record Qr(string Id, byte[] Image);

    internal sealed record Credential(long MusicId, string MusicKey, int LoginType, DateTimeOffset? ExpiresAt);

    internal sealed record Mp3(string Mid, string MediaId, long Size)
    {
        public string Filename => $"M500{MediaId}.mp3";
    }

    internal sealed record Resource(Uri Url, DateTimeOffset ExpiresAt);

    internal sealed record Entitlements(Dictionary<string, Resource[]> Streams, HashSet<string> Denied);

    public async Task<Qr> CreateQrAsync(CancellationToken ct)
    {
        var data = await CallAsync("music.login.LoginServer", "CreateQRCode", null, ct, writer =>
        {
            writer.WriteString("tmeAppID", "qqmusic");
            writer.WriteNumber("ct", 11);
            writer.WriteNumber("cv", 20090008);
        }, qr: true);
        var id = Text(data, "qrcodeID");
        var encoded = Text(data, "qrcode");
        if (!Token(id, 256) || id.Any(c => c is '/' or '#' or '+' or '?') || encoded.Length is < 20 or > 350000)
            throw Unavailable();
        byte[] image;
        try
        {
            image = Convert.FromBase64String(encoded[(encoded.LastIndexOf(',') + 1)..]);
        }
        catch (FormatException)
        {
            throw Unavailable();
        }

        return !image.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? throw Unavailable() : new Qr(id, image);
    }

    public async Task<Credential> CompleteLoginAsync(string qrId, JsonElement message, CancellationToken ct)
    {
        var cookies = At(message, "cookies");
        var uin = Text(At(cookies, "qqmusic_uin"), "value");
        var token = Text(At(cookies, "qqmusic_key"), "value");
        if (!long.TryParse(uin, NumberStyles.None, CultureInfo.InvariantCulture, out var id) || id <= 0 || !Token(token, 2048))
            throw Unavailable();
        var data = await CallAsync("music.login.LoginServer", "Login", null, ct, writer =>
        {
            writer.WriteNumber("musicid", id);
            writer.WriteString("qrCodeID", qrId);
            writer.WriteString("token", token);
        }, login: true);
        var key = Text(data, "musickey");
        var musicId = Number(data, "musicid");
        if (musicId <= 0 || !Token(key, 2048)) throw Unavailable();
        var type = Number(data, "loginType");
        var creation = Number(data, "musickeyCreateTime");
        var ttl = Number(data, "keyExpiresIn");
        DateTimeOffset? expires = creation is > 0 and < 4102444800 && ttl is > 0 and < 31536000 ? DateTimeOffset.FromUnixTimeSeconds(creation + ttl) : null;
        return new Credential(musicId, key, type is > 0 and <= 9 ? (int)type : key.StartsWith("W_X", StringComparison.Ordinal) ? 1 : 2, expires);
    }

    public async Task<Entitlements> GetStreamsAsync(Credential credential, Mp3[] songs, CancellationToken ct)
    {
        if (songs.Length is < 1 or > 30) throw new ArgumentOutOfRangeException(nameof(songs));
        var guid = RandomNumberGenerator.GetInt32(100000000, int.MaxValue).ToString(CultureInfo.InvariantCulture);
        var uin = credential.MusicId.ToString(CultureInfo.InvariantCulture);
        var data = await CallAsync("music.vkey.GetVkey", "UrlGetVkey", credential, ct, writer =>
        {
            writer.WriteString("uin", uin);
            writer.WriteString("guid", guid);
            writer.WriteNumber("ctx", 0);
            writer.WriteStartArray("songmid");
            foreach (var song in songs) writer.WriteStringValue(song.Mid);
            writer.WriteEndArray();
            writer.WriteStartArray("songtype");
            foreach (var _ in songs) writer.WriteNumberValue(0);
            writer.WriteEndArray();
            writer.WriteStartArray("filename");
            foreach (var song in songs) writer.WriteStringValue(song.Filename);
            writer.WriteEndArray();
        });

        var roots = Hosts(At(data, "sip")).Append(new Uri("https://isure.stream.qqmusic.qq.com/")).Distinct().ToArray();
        var rows = At(data, "midurlinfo");
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > songs.Length) throw Unavailable();
        var expiration = Number(data, "expiration");
        var expires = clock.GetUtcNow().AddSeconds(expiration > 0 ? Math.Min(expiration, 300) : 180);
        if (credential.ExpiresAt is { } maximum && maximum < expires) expires = maximum;
        var requested = songs.ToDictionary(song => song.Mid, StringComparer.Ordinal);
        var streams = new Dictionary<string, Resource[]>(StringComparer.Ordinal);
        var denied = new HashSet<string>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows.EnumerateArray())
        {
            var mid = Text(row, "songmid");
            if (!requested.TryGetValue(mid, out var song) || !seen.Add(mid)) throw Unavailable();
            if (!TryNumber(row, "result", out var result)) continue;
            if (result is 104003 or 104013) denied.Add(mid);
            if (result != 0) continue;
            var path = Text(row, "purl");
            if (!path.StartsWith(song.Filename + "?", StringComparison.Ordinal) || path.Length > 4096) continue;
            var candidates = roots.Select(root => new Uri(root, path)).Where(url => url.AbsolutePath == "/" + song.Filename && url.Fragment.Length == 0).Select(url => new Resource(url, expires)).ToArray();
            if (candidates.Length > 0) streams.Add(mid, candidates);
        }

        return new Entitlements(streams, denied);
    }

    public async Task<Resource?> ConfirmAsync(Mp3 song, Resource[] candidates, CancellationToken ct)
    {
        foreach (var resource in candidates.Take(3))
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, resource.Url);
            request.Headers.Range = new RangeHeaderValue(0, 0);
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                throw new MusicException("rate_limited", "QQ 音乐请求较多，请稍后重试。", 429, 60);
            if (response is { StatusCode: System.Net.HttpStatusCode.PartialContent, Content.Headers.ContentRange: { From: 0, To: 0 } range } && range.Length == song.Size)
                return resource;
        }

        return null;
    }

    private async Task<JsonElement> CallAsync(string module, string method, Credential? credential, CancellationToken ct, Action<Utf8JsonWriter> parameters, bool qr = false, bool login = false)
    {
        using var body = new MemoryStream();
        await using (var writer = new Utf8JsonWriter(body))
        {
            writer.WriteStartObject();
            writer.WriteStartObject("comm");
            writer.WriteString("ct", qr ? "23" : "11");
            writer.WriteString("cv", qr ? "0" : ClientVersion);
            writer.WriteString("v", ClientVersion);
            writer.WriteString("chid", "10003505");
            writer.WriteString("tmeAppID", "qqmusic");
            writer.WriteString("OpenUDID", _device);
            writer.WriteString("udid", _device);
            if (login) writer.WriteString("tmeLoginType", "6");
            if (credential is not null)
            {
                writer.WriteString("qq", credential.MusicId.ToString(CultureInfo.InvariantCulture));
                writer.WriteString("authst", credential.MusicKey);
                writer.WriteString("tmeLoginType", credential.LoginType.ToString(CultureInfo.InvariantCulture));
            }

            writer.WriteEndObject();
            writer.WriteStartObject("req_0");
            writer.WriteString("module", module);
            writer.WriteString("method", method);
            writer.WriteStartObject("param");
            parameters(writer);
            writer.WriteEndObject();
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        body.Position = 0;
        using var request = new HttpRequestMessage(HttpMethod.Post, Gateway);
        request.Content = new StreamContent(body);
        request.Headers.UserAgent.ParseAdd("QQMusic 20090008 (android 13)");
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
            throw new MusicException("rate_limited", "QQ 音乐请求较多，请稍后重试。", 429, 60);
        if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 524288) throw Unavailable();
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        var bytes = new byte[524289];
        var length = await stream.ReadAtLeastAsync(bytes, bytes.Length, false, timeout.Token);
        if (length == bytes.Length) throw Unavailable();
        using var json = JsonDocument.Parse(bytes.AsMemory(0, length));
        var item = At(json.RootElement, "req_0");
        var data = At(item, "data");
        if (!TryNumber(json.RootElement, "code", out var outer) || !TryNumber(item, "code", out var inner)) throw Unavailable();
        if (credential is not null && (Expired(outer) || Expired(inner) || Expired(Number(data, "code"))))
            throw new QQSessionExpiredException();
        if (outer != 0 || inner != 0 || data.ValueKind != JsonValueKind.Object || Number(data, "code") != 0) throw Unavailable();
        return data.Clone();
    }

    private static IEnumerable<Uri> Hosts(JsonElement array)
    {
        if (array.ValueKind != JsonValueKind.Array) yield break;
        foreach (var row in array.EnumerateArray().Take(5))
        {
            if (row.ValueKind != JsonValueKind.String || !Uri.TryCreate(row.GetString(), UriKind.Absolute, out var uri) ||
                uri.Scheme is not ("https" or "http") || !uri.IsDefaultPort || uri.UserInfo.Length != 0 ||
                uri.PathAndQuery != "/" || uri.Fragment.Length != 0 ||
                !(uri.IdnHost == "aqqmusic.tc.qq.com" || uri.IdnHost.EndsWith(".stream.qqmusic.qq.com", StringComparison.Ordinal))) continue;
            yield return new UriBuilder(uri) { Scheme = "https", Port = -1 }.Uri;
        }
    }

    private static bool Expired(long code) => code is 104400 or 104401;

    private static bool Token(string text, int limit) => text.Length > 0 && text.Length <= limit && text.All(c => c is >= '!' and <= '~');

    private static JsonElement At(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var item) ? item : default;

    private static string Text(JsonElement value, string key) => At(value, key) is { ValueKind: JsonValueKind.String } item ? item.GetString() ?? "" : "";

    private static long Number(JsonElement value, string key) => TryNumber(value, key, out var number) ? number : 0;

    private static bool TryNumber(JsonElement value, string key, out long number)
    {
        var item = At(value, key);
        return item.ValueKind == JsonValueKind.Number ? item.TryGetInt64(out number) : long.TryParse(item.ValueKind == JsonValueKind.String ? item.GetString() : null, NumberStyles.Integer, CultureInfo.InvariantCulture, out number);
    }

    internal static MusicException Unavailable() => new("source_unavailable", "QQ 音乐会员服务暂时不可用。", 503);
}

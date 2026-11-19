using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Providers;

internal sealed class QQMusicSkill(HttpClient http, MusicOptions options, TimeProvider clock)
{
    private sealed record Song(string Mid, string Query);
    private readonly SemaphoreSlim _gate = new(1);
    private DateTimeOffset _refreshAt;
    private Song[] _songs = [];
    private MusicTrack[] _extra = [];

    public async Task<MusicTrack[]> PersonalizeAsync(MusicTrack[] tracks, QQMusicProvider qq, MusicCatalog catalog, CancellationToken ct)
    {
        var key = options.QQMusicSkillApiKey.Trim();
        if (!key.StartsWith("qmk-", StringComparison.Ordinal) || key.Length <= 4 || key.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)))
            return tracks;

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        var token = budget.Token;
        try
        {
            await _gate.WaitAsync(token);
            try
            {
                var now = clock.GetUtcNow();
                if (_refreshAt <= now)
                {
                    _refreshAt = now.AddMinutes(30);
                    _songs = (await Task.WhenAll(ReadAsync("daily-mix", key, token), ReadAsync("radio", key, token)))
                        .SelectMany(x => x).DistinctBy(x => x.Mid).ToArray();
                    _extra = [];
                    var known = tracks.SelectMany(x => x.Sources).Where(x => x.ProviderId == QQMusicProvider.Id)
                        .Select(x => x.SourceTrackId).ToHashSet(StringComparer.Ordinal);
                    var extra = new List<MusicTrack>();
                    foreach (var song in _songs.Where(x => !known.Contains(x.Mid)).Take(2))
                    {
                        var page = await qq.SearchAsync(song.Query, 10, null, token);
                        var exact = page.Items.FirstOrDefault(x => x.Availability == "candidate" &&
                            x.Sources.Any(s => s.ProviderId == QQMusicProvider.Id && s.SourceTrackId == song.Mid));
                        if (exact is not null) extra.Add(exact);
                    }
                    _extra = extra.ToArray();
                    if (_songs.Length > 0) _refreshAt = now.AddHours(1);
                }

                var rank = _songs.Select((song, index) => (song.Mid, index)).ToDictionary(x => x.Mid, x => x.index);
                var merged = _extra.Length == 0 ? tracks : catalog.MergeDaily(tracks.Concat(_extra));
                return merged.Where(x => x.Availability == "candidate").OrderBy(track => track.Sources
                    .Where(x => x.ProviderId == QQMusicProvider.Id)
                    .Select(x => rank.GetValueOrDefault(x.SourceTrackId, int.MaxValue))
                    .DefaultIfEmpty(int.MaxValue).Min()).ToArray();
            }
            finally
            {
                _gate.Release();
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return tracks; }
        catch (MusicException) { return tracks; }
    }

    private async Task<Song[]> ReadAsync(string endpoint, string key, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://a.y.qq.com/discover/{endpoint}")
        {
            Content = new StringContent("""{"params":{},"comm":{"skill_version":"0.0.3"}}""", Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) return [];
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            var buffer = new byte[64 * 1024 + 1];
            var length = await stream.ReadAtLeastAsync(buffer, buffer.Length, false, ct);
            if (length == buffer.Length) return [];
            using var json = JsonDocument.Parse(buffer.AsMemory(0, length));
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                new[] { "ret", "sub_ret" }.Any(code => root.TryGetProperty(code, out var value) &&
                    value.ValueKind != JsonValueKind.Null && (value.ValueKind != JsonValueKind.Number || value.GetRawText() != "0")) ||
                !root.TryGetProperty("songlist", out var rows) || rows.ValueKind != JsonValueKind.Array) return [];
            return rows.EnumerateArray().Take(30).Select(row =>
            {
                var mid = Text(row, "songMid");
                var query = (Text(row, "songName") + " " + Text(row, "singerName")).Trim();
                return mid.Length is >= 8 and <= 24 && mid.All(char.IsAsciiLetterOrDigit) &&
                    query.Length is >= 1 and <= 100 && !query.Any(char.IsControl) ? new Song(mid, query) : null;
            }).OfType<Song>().ToArray();
        }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException) { return []; }
    }

    private static string Text(JsonElement row, string key) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String
            ? item.GetString() ?? "" : "";
}

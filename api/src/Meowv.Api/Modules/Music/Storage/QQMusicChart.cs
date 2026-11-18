using System.Globalization;
using System.Text.Json;
using Meowv.Api.Infrastructure;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicChartPage(string Source, string Chart, DateOnly Period, DateOnly SourceUpdatedDate,
    DateTimeOffset CapturedAt, bool Stale, MusicChartEntry[] Entries);

internal sealed class QQMusicChart(HttpClient http, MusicChartStore store, TimeProvider clock)
{
    private const string Source = "qqmusic";
    private const string Chart = "rising";
    private const int Count = 20;
    private const int MaxBytes = 384 * 1024;
    private static readonly TimeZoneInfo BusinessZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");
    private static readonly string RequestUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg?data=" + Uri.EscapeDataString(
        """{"req":{"module":"musicToplist.ToplistInfoServer","method":"GetDetail","param":{"topid":62,"offset":0,"num":20}}}""");
    private readonly SemaphoreSlim _refresh = new(1, 1);
    private DateTimeOffset _retryAt;
    private bool _lastRefreshFailed;
    private MusicChartPage? _current;

    public bool IsCurrent(MusicChartPage snapshot)
    {
        var current = Volatile.Read(ref _current);
        return current is { Stale: false } && current.CapturedAt == snapshot.CapturedAt &&
            current.Period == snapshot.Period && current.Period == LocalDate(clock.GetUtcNow());
    }

    public async Task<MusicChartPage> GetAsync(bool forceRefresh, CancellationToken ct)
    {
        await _refresh.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            var today = LocalDate(now);
            var latest = store.Latest(Chart, Source);
            if (_retryAt <= now && (forceRefresh || _lastRefreshFailed || latest?.BusinessDate != today))
            {
                // 新榜单发布前以及故障时最多半小时探测一次，多个调用共享同一个刷新入口。
                _retryAt = now.AddMinutes(30);
                try
                {
                    var snapshot = await FetchAsync(ct);
                    ct.ThrowIfCancellationRequested();
                    if (store.Save(snapshot)) latest = store.Latest(Chart, Source);
                    _lastRefreshFailed = false;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    _retryAt = now;
                    throw;
                }
                catch (Exception error) when (error is HttpRequestException or IOException or InvalidDataException or JsonException or
                    OperationCanceledException or ArgumentException or SqliteException)
                {
                    _lastRefreshFailed = true;
                }
            }
            if (latest is null)
                throw new MusicException("source_unavailable", "QQ 音乐榜单暂不可用。", 503,
                    (int)Math.Clamp(Math.Ceiling((_retryAt - clock.GetUtcNow()).TotalSeconds), 1, int.MaxValue));
            var result = new MusicChartPage(Source, Chart, latest.BusinessDate, LocalDate(latest.SourceUpdatedAt),
                latest.CapturedAt, _lastRefreshFailed || latest.BusinessDate < today, latest.Entries);
            Volatile.Write(ref _current, result);
            return result;
        }
        catch (Exception error) when (error is SqliteException or ApiDatabaseSchemaException or IOException or InvalidDataException or JsonException)
        {
            Volatile.Write(ref _current, null);
            throw new MusicException("source_unavailable", "音乐榜单快照暂不可用。", 503, 30);
        }
        finally { _refresh.Release(); }
    }

    private async Task<MusicChartSnapshot> FetchAsync(CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(6));
        using var response = await http.GetAsync(RequestUrl, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.Headers.RetryAfter is { } header)
        {
            var now = clock.GetUtcNow();
            var next = header.Date ?? now + (header.Delta ?? TimeSpan.Zero);
            if (next > _retryAt) _retryAt = next;
        }
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > MaxBytes) throw InvalidChart();
        using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        var buffer = new byte[MaxBytes + 1];
        var length = await stream.ReadAtLeastAsync(buffer, buffer.Length, false, timeout.Token);
        if (length > MaxBytes) throw InvalidChart();
        using var document = JsonDocument.Parse(buffer.AsMemory(0, length));
        return Parse(document.RootElement, clock.GetUtcNow());
    }

    private static MusicChartSnapshot Parse(JsonElement root, DateTimeOffset capturedAt)
    {
        try
        {
            var message = root.GetProperty("req");
            if (root.GetProperty("code").GetInt32() != 0 || message.GetProperty("code").GetInt32() != 0) throw InvalidChart();
            var response = message.GetProperty("data");
            var data = response.GetProperty("data");
            if (data.GetProperty("topId").GetInt32() != 62) throw InvalidChart();
            var period = Date(data, "period");
            var updated = Date(data, "updateTime");
            if (period > LocalDate(capturedAt) || updated < period) throw InvalidChart();
            var rows = data.GetProperty("song");
            var detailRows = response.GetProperty("songInfoList");
            var length = Math.Min(Count, data.GetProperty("totalNum").GetInt32());
            if (length < 1 || rows.GetArrayLength() != length || detailRows.GetArrayLength() != length) throw InvalidChart();
            var details = detailRows.EnumerateArray().ToDictionary(x => x.GetProperty("id").GetInt64());
            var entries = rows.EnumerateArray().Select(row =>
            {
                var song = details[row.GetProperty("songId").GetInt64()];
                var duration = song.GetProperty("interval").GetInt64();
                return new MusicChartEntry(row.GetProperty("rank").GetInt32(), Text(song, "mid"), Text(song, "title"),
                    song.GetProperty("singer").EnumerateArray().Select(x => Text(x, "name")).ToArray(),
                    duration is > 0 and <= 86_400 ? duration * 1000 : null);
            }).OrderBy(x => x.Rank).ToArray();
            if (!entries.Select(x => x.Rank).SequenceEqual(Enumerable.Range(1, length))) throw InvalidChart();
            return new MusicChartSnapshot(Chart, Source, period, capturedAt, Midnight(updated), Midnight(period),
                Midnight(period.AddDays(1)), entries);
        }
        catch (Exception error) when (error is InvalidOperationException or KeyNotFoundException or FormatException or ArgumentException)
        {
            throw InvalidChart();
        }
    }

    private static string Text(JsonElement element, string field) => element.GetProperty(field).GetString() ?? throw InvalidChart();
    private static DateOnly Date(JsonElement element, string field) =>
        DateOnly.ParseExact(Text(element, field), "yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static DateOnly LocalDate(DateTimeOffset time) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time, BusinessZone).DateTime);
    private static DateTimeOffset Midnight(DateOnly date)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, BusinessZone.GetUtcOffset(local)).ToUniversalTime();
    }
    private static InvalidDataException InvalidChart() => new("QQ 音乐榜单响应无效。");
}

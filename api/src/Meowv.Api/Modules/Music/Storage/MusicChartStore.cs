using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicChartEntry(
    int Rank,
    string TrackKey,
    string Title,
    string[] Artists,
    long? DurationMs = null,
    string? Isrc = null);

internal sealed record MusicChartSnapshot(
    string ChartKey,
    string Source,
    DateOnly BusinessDate,
    DateTimeOffset CapturedAt,
    DateTimeOffset SourceUpdatedAt,
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    MusicChartEntry[] Entries);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicChartEntry[]))]
[JsonSerializable(typeof(MusicChartPage))]
internal partial class MusicChartJsonContext : JsonSerializerContext;

internal sealed class MusicChartStore(ApiDatabase database)
{
    private const int RetainedSnapshots = 30;
    private const int MaxPayloadLength = 512 * 1024;
    private readonly Lock _gate = new();
    private bool _initialized;

    private void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            database.EnsureSchema("music-charts", 1, """
                                                     CREATE TABLE music_chart_snapshots (
                                                         chart_key TEXT NOT NULL,
                                                         source_name TEXT NOT NULL,
                                                         business_date TEXT NOT NULL,
                                                         captured_at INTEGER NOT NULL,
                                                         source_updated_at INTEGER NOT NULL,
                                                         window_start INTEGER NOT NULL,
                                                         window_end INTEGER NOT NULL,
                                                         entries_json TEXT NOT NULL,
                                                         PRIMARY KEY(chart_key, source_name, business_date)
                                                     ) WITHOUT ROWID;
                                                     """);
            _initialized = true;
        }
    }

    internal static void Validate(MusicChartSnapshot snapshot)
    {
        if (snapshot.WindowStart >= snapshot.WindowEnd || snapshot.SourceUpdatedAt < snapshot.WindowStart ||
            snapshot.SourceUpdatedAt > snapshot.CapturedAt ||
            !ValidKey(snapshot.ChartKey) || !ValidKey(snapshot.Source) || !ValidEntries(snapshot.Entries))
            throw new ArgumentException("榜单快照的元数据无效。", nameof(snapshot));
    }

    public bool Save(MusicChartSnapshot snapshot)
    {
        Validate(snapshot);
        var entries = snapshot.Entries.OrderBy(x => x.Rank).ToArray();
        var payload = JsonSerializer.Serialize(entries, MusicChartJsonContext.Default.MusicChartEntryArray);
        if (payload.Length > MaxPayloadLength) throw new ArgumentException("榜单快照过大。", nameof(snapshot));
        Initialize();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        // 重复或更旧的上游版本不创建本地新快照。同日的新版本在同一事务内替换整份榜单。
        command.CommandText = """
                              INSERT INTO music_chart_snapshots
                                  (chart_key, source_name, business_date, captured_at, source_updated_at, window_start, window_end, entries_json)
                              SELECT $chart, $source, $date, $captured, $updated, $start, $end, $entries
                              WHERE NOT EXISTS (
                                  SELECT 1 FROM music_chart_snapshots WHERE chart_key=$chart AND source_name=$source
                                      AND (source_updated_at >= $updated OR business_date > $date)
                              )
                              ON CONFLICT(chart_key, source_name, business_date) DO UPDATE SET
                                  captured_at=excluded.captured_at, source_updated_at=excluded.source_updated_at,
                                  window_start=excluded.window_start, window_end=excluded.window_end, entries_json=excluded.entries_json;
                              """;
        command.Parameters.AddWithValue("$chart", snapshot.ChartKey);
        command.Parameters.AddWithValue("$source", snapshot.Source);
        command.Parameters.AddWithValue("$date", snapshot.BusinessDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("$captured", snapshot.CapturedAt.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$updated", snapshot.SourceUpdatedAt.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$start", snapshot.WindowStart.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$end", snapshot.WindowEnd.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$entries", payload);
        var saved = command.ExecuteNonQuery() > 0;
        if (saved)
        {
            command.Parameters.Clear();
            command.Parameters.AddWithValue("$chart", snapshot.ChartKey);
            command.Parameters.AddWithValue("$source", snapshot.Source);
            command.Parameters.AddWithValue("$limit", RetainedSnapshots);
            command.CommandText = """
                                  DELETE FROM music_chart_snapshots WHERE chart_key=$chart AND source_name=$source AND business_date IN (
                                      SELECT business_date FROM music_chart_snapshots WHERE chart_key=$chart AND source_name=$source
                                      ORDER BY business_date DESC LIMIT -1 OFFSET $limit
                                  );
                                  """;
            command.ExecuteNonQuery();
        }

        transaction.Commit();
        return saved;
    }

    public MusicChartSnapshot? Latest(string chartKey, string source)
    {
        if (!ValidKey(chartKey) || !ValidKey(source)) throw new ArgumentException("榜单标识无效。");
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT business_date,captured_at,source_updated_at,window_start,window_end,entries_json
                              FROM music_chart_snapshots WHERE chart_key=$chart AND source_name=$source ORDER BY business_date DESC LIMIT 1;
                              """;
        command.Parameters.AddWithValue("$chart", chartKey);
        command.Parameters.AddWithValue("$source", source);
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;
        var payload = reader.GetString(5);
        if (payload.Length > MaxPayloadLength ||
            JsonSerializer.Deserialize(payload, MusicChartJsonContext.Default.MusicChartEntryArray) is not { } entries ||
            !ValidEntries(entries)) throw new InvalidDataException("已保存的榜单条目无效。");
        return new MusicChartSnapshot(chartKey, source, DateOnly.ParseExact(reader.GetString(0), "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(1)), DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(2)),
            DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(3)), DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(4)), entries);
    }

    private static bool ValidKey(string? key) =>
        key is { Length: >= 1 and <= 80 } && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    private static bool ValidEntries(MusicChartEntry[]? entries) =>
        entries is { Length: >= 1 and <= 100 } && entries.All(x => x.Rank is >= 1 and <= 100 && ValidKey(x.TrackKey) && ValidText(x.Title) &&
                                                                   x.Artists is { Length: >= 1 and <= 8 } && x.Artists.All(ValidText) &&
                                                                   x.DurationMs is null or (> 0 and <= 86_400_000) &&
                                                                   (x.Isrc is null || x.Isrc.Length == 12 && x.Isrc.All(char.IsAsciiLetterOrDigit))) &&
        entries.Select(x => x.Rank).Distinct().Count() == entries.Length &&
        entries.Select(x => x.TrackKey).Distinct(StringComparer.Ordinal).Count() == entries.Length;

    private static bool ValidText(string? value) => value is { Length: <= 180 } &&
                                                    !string.IsNullOrWhiteSpace(value) && !value.Any(char.IsControl);
}
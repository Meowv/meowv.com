namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicChartSnapshot(string ChartKey, string Source, DateOnly BusinessDate, DateTimeOffset CapturedAt, DateTimeOffset SourceUpdatedAt, DateTimeOffset WindowStart, DateTimeOffset WindowEnd, MusicChartEntry[] Entries);

namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicDailySource(string Source, DateTimeOffset CapturedAt, DateTimeOffset SourceUpdatedAt, bool Stale);

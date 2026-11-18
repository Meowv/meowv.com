namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicDailySource(string Source, DateTimeOffset CapturedAt, DateTimeOffset SourceUpdatedAt, bool Stale);
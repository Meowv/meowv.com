namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicChartEntry(int Rank, string TrackKey, string Title, string[] Artists, long? DurationMs = null, string? Isrc = null, string? Album = null, string? CoverUrl = null, string? TrackId = null, string? Availability = null, string? MediaId = null, long MediaSize = 0, bool? RequiresMembership = null);

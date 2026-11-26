namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicTrack(string Id, string Title, string[] Artists, string? Album, long? DurationMs, string? CoverUrl, string? Isrc, string Availability, MusicSource[] Sources);
namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicSource(string ProviderId, string SourceTrackId, double? Confidence = null, string? Edition = null);
namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicHealth(string Status, int EnabledProviderCount, string ConfigVersion);
public sealed record MusicProvider(string Id, string DisplayName, string Status, string[] Capabilities, bool SupportsFullTrack);
public sealed record MusicProviders(MusicProvider[] Providers);
public sealed record MusicSource(string ProviderId, string SourceTrackId);
public sealed record MusicTrack(string Id, string Title, string[] Artists, string? Album, long? DurationMs,
    string? CoverUrl, string? Isrc, string Availability, MusicSource[] Sources);
public sealed record MusicSearchPage(MusicTrack[] Items, string? NextCursor, bool Partial, string[] Warnings);
public sealed record MusicRecommendationPage(MusicTrack[] Items, string? NextCursor, string Strategy, DateTime GeneratedAt);
public sealed record MusicResolveRequest(string? TrackId, string? PreferredProviderId = null, string Quality = "auto");
public sealed record MusicAudio(string Url, string? MimeType, long? DurationMs, DateTime? ExpiresAt, bool Seekable);
public sealed record MusicResolvedTrack(string TrackId, string ProviderId, string SourceTrackId, double Confidence, MusicAudio Audio);
public sealed record MusicError(string Code, string Message, bool Retryable, int? RetryAfterSeconds, string RequestId);
public sealed record MusicErrorResponse(MusicError Error);

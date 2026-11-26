namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicResolvedTrack(string TrackId, string ProviderId, string SourceTrackId, double Confidence, MusicAudio Audio);
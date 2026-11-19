namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicRecommendationPage(MusicTrack[] Items, string? NextCursor, string Strategy, DateTime GeneratedAt, bool Partial = false, string[]? Warnings = null);
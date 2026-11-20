namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicRecommendationPage(
    MusicTrack[] Items,
    string? NextCursor,
    string Strategy,
    DateTime GeneratedAt,
    bool Partial = false,
    string[]? Warnings = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    string[]? DiscoveryTrackIds = null);
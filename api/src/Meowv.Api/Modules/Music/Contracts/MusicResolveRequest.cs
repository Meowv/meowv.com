namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicResolveRequest(
    string? TrackId,
    string? PreferredProviderId = null,
    string Quality = "auto",
    string? ExcludedProviderId = null);
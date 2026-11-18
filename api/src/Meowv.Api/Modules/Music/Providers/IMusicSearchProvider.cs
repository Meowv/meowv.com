using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Providers;

public interface IMusicSearchProvider
{
    string ProviderId { get; }
    string DisplayName { get; }
    string Version { get; }
    string Status { get; }
    MusicTrack? FindTrack(string id);
    Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct);
}

public interface IMusicResolverProvider
{
    Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct);
}

public interface IMusicLyricsProvider
{
    Task<string?> LyricsAsync(string sourceId, CancellationToken ct);
}

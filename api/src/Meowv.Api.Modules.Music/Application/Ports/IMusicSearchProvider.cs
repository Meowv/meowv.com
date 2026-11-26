
namespace Meowv.Api.Modules.Music.Application.Ports;

public interface IMusicSearchProvider
{
    string ProviderId { get; }
    string DisplayName { get; }
    string Version { get; }
    string Status { get; }
    MusicTrack? FindTrack(string id);
    Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct);
}

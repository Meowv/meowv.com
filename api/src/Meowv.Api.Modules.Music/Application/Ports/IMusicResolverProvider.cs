
namespace Meowv.Api.Modules.Music.Application.Ports;

public interface IMusicResolverProvider
{
    Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct);
}

using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Providers;

public interface IMusicResolverProvider
{
    Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct);
}
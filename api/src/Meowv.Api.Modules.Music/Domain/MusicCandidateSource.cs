
namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicCandidateSource(MusicTrack Track, string? MediaId = null, long MediaSize = 0, bool? RequiresMembership = null);

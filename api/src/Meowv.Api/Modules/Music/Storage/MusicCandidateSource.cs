using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicCandidateSource(MusicTrack Track, string? MediaId = null, long MediaSize = 0, bool? RequiresMembership = null);
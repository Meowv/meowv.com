namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicCandidateState(MusicCandidate[] Items, Dictionary<string, string> Positions, int Turn, DateTimeOffset Refreshed);

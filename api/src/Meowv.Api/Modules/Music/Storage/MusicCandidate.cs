namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicCandidate(MusicCandidateSource[] Sources, DateTimeOffset Added, DateTimeOffset Seen, bool Discovery, bool Private = false);
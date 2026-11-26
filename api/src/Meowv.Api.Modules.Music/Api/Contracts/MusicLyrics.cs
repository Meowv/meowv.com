namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicLyrics(string TrackId, string? ProviderId, string? Lrc);
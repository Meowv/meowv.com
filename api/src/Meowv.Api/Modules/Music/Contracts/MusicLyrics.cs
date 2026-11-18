namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicLyrics(string TrackId, string? ProviderId, string? Lrc);
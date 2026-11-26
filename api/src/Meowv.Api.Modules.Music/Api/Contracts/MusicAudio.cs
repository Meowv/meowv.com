namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicAudio(string Url, string? MimeType, long? DurationMs, DateTime? ExpiresAt, bool Seekable);
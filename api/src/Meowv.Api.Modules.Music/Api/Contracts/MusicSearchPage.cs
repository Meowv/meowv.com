namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicSearchPage(MusicTrack[] Items, string? NextCursor, bool Partial, string[] Warnings);
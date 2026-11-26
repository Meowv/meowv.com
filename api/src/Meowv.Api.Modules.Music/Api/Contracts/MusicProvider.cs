namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicProvider(string Id, string DisplayName, string Status, string[] Capabilities, bool SupportsFullTrack);
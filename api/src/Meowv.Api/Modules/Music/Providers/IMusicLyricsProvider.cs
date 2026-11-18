namespace Meowv.Api.Modules.Music.Providers;

public interface IMusicLyricsProvider
{
    Task<string?> LyricsAsync(string sourceId, CancellationToken ct);
}
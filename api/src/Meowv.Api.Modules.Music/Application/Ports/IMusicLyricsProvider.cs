namespace Meowv.Api.Modules.Music.Application.Ports;

public interface IMusicLyricsProvider
{
    Task<string?> LyricsAsync(string sourceId, CancellationToken ct);
}
